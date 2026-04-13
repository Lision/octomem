/**
 * MemoryStore — the main facade for all memory storage operations.
 *
 * Integrates: EmbeddingService, TagService, SearchEngine, segmentation, and schema management.
 */

import type { DatabaseSync } from 'node:sqlite';
import { openConnection, closeConnection } from './connection.js';
import { initSchema } from './schema.js';
import { EmbeddingService } from './embedding.js';
import { TagService } from './tags.js';
import { SearchEngine } from './search.js';
import { segmentMarkdown } from './segment.js';
import {
  generateId,
  hashText,
  parseEmbedding,
  serializeEmbedding,
  truncateText,
  cosineSimilarity,
  jaccardSimilarity,
} from './utils.js';
import {
  DEFAULT_SEARCH_CONFIG,
  type AddMemoryInput,
  type Conflict,
  type ConflictRow,
  type Memory,
  type MemoryRow,
  type ResolutionType,
  type SearchConfig,
  type SearchResult,
  type Segment,
  type SimilarMemory,
  type StorageConfig,
  type Tag,
} from './types.js';

export class MemoryStore {
  private config: StorageConfig;
  private db: DatabaseSync | null = null;
  private embedding: EmbeddingService;
  private tagService: TagService | null = null;
  private searchEngine: SearchEngine | null = null;
  private vecAvailable = false;

  constructor(config: StorageConfig) {
    this.config = config;
    this.embedding = new EmbeddingService(config.embedding);
  }

  // ─── Lifecycle ───

  async init(): Promise<void> {
    const result = await openConnection({
      dbPath: this.config.dbPath,
      tryLoadVec: true,
    });

    this.db = result.db;
    this.vecAvailable = result.vecAvailable;
    this.embedding.setDatabase(this.db);

    const schemaResult = initSchema(this.db);

    // Create embedding_cache table if not exists (managed by EmbeddingService)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        model TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding TEXT NOT NULL,
        dims INTEGER,
        created_at TEXT NOT NULL,
        PRIMARY KEY (model, content_hash)
      );
    `);

    this.tagService = new TagService(this.db, this.embedding);

    const searchConfig: SearchConfig = {
      maxResults: this.config.search?.maxResults ?? DEFAULT_SEARCH_CONFIG.maxResults,
      minScore: this.config.search?.minScore ?? DEFAULT_SEARCH_CONFIG.minScore,
      hybrid: {
        ...DEFAULT_SEARCH_CONFIG.hybrid,
        ...this.config.search?.hybrid,
      },
      mmr: {
        ...DEFAULT_SEARCH_CONFIG.mmr,
        ...this.config.search?.mmr,
      },
    };
    this.searchEngine = new SearchEngine(this.db, this.embedding, searchConfig, this.vecAvailable);
  }

  close(): void {
    if (this.db) {
      closeConnection(this.db);
      this.db = null;
    }
  }

  private ensureInit(): DatabaseSync {
    if (!this.db) throw new Error('MemoryStore not initialized. Call init() first.');
    return this.db;
  }

  // ─── Memory CRUD ───

  async addMemory(input: AddMemoryInput): Promise<Memory> {
    const db = this.ensureInit();
    const now = new Date().toISOString();
    const id = generateId();

    // Generate embedding for the content
    const textToEmbed = input.summary ?? input.content;
    const embedding = await this.embedding.embed(textToEmbed);

    // Use tags directly — callers (e.g. pipeline) are responsible for resolving tags
    const tags = input.tags ?? [];

    // Insert memory
    db.prepare(
      `INSERT INTO memories (id, title, content, summary, key_points, embedding, confidence, status, chain_root_id, cluster_id, access_count, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, ?, ?, ?)`,
    ).run(
      id,
      input.title ?? null,
      input.content,
      input.summary ?? null,
      input.keyPoints ? JSON.stringify(input.keyPoints) : null,
      serializeEmbedding(embedding),
      input.confidence ?? 0.8,
      input.chainRootId ?? null,
      null, // cluster_id
      input.source ?? 'user_input',
      now,
      now,
    );

    // Create segments
    const segments = segmentMarkdown(input.content);
    for (const seg of segments) {
      const segId = generateId();
      const segEmbedding = await this.embedding.embed(seg.text);

      db.prepare(
        `INSERT INTO segments (id, memory_id, start_line, end_line, text, hash, embedding, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        segId,
        id,
        seg.startLine,
        seg.endLine,
        seg.text,
        seg.hash,
        serializeEmbedding(segEmbedding),
        now,
      );

      // Insert into FTS
      db.prepare(`INSERT INTO segments_fts (id, memory_id, text) VALUES (?, ?, ?)`).run(
        segId,
        id,
        seg.text,
      );

      // Insert into vec table if available
      if (this.vecAvailable) {
        try {
          db.prepare(`INSERT INTO segments_vec (id, embedding) VALUES (?, ?)`).run(
            segId,
            Buffer.from(new Float32Array(segEmbedding).buffer),
          );
        } catch {
          // Ignore vec errors
        }
      }
    }

    // Insert tag associations
    for (const tag of tags) {
      db.prepare(`INSERT OR IGNORE INTO memory_tags (memory_id, tag_name) VALUES (?, ?)`).run(
        id,
        tag,
      );
    }

    return this.getMemory(id) as Promise<Memory>;
  }

  async getMemory(id: string): Promise<Memory | null> {
    const db = this.ensureInit();
    const row = db
      .prepare('SELECT * FROM memories WHERE id = ?')
      .get(id) as unknown as MemoryRow | undefined;
    if (!row) return null;

    return this.rowToMemory(row);
  }

  async updateMemory(id: string, updates: Partial<Memory>): Promise<void> {
    const db = this.ensureInit();
    const now = new Date().toISOString();

    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.title !== undefined) { setClauses.push('title = ?'); values.push(updates.title); }
    if (updates.content !== undefined) { setClauses.push('content = ?'); values.push(updates.content); }
    if (updates.summary !== undefined) { setClauses.push('summary = ?'); values.push(updates.summary); }
    if (updates.keyPoints !== undefined) { setClauses.push('key_points = ?'); values.push(JSON.stringify(updates.keyPoints)); }
    if (updates.confidence !== undefined) { setClauses.push('confidence = ?'); values.push(updates.confidence); }
    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
    if (updates.chainRootId !== undefined) { setClauses.push('chain_root_id = ?'); values.push(updates.chainRootId); }
    if (updates.clusterId !== undefined) { setClauses.push('cluster_id = ?'); values.push(updates.clusterId); }

    values.push(id);
    const stmt = db.prepare(`UPDATE memories SET ${setClauses.join(', ')} WHERE id = ?`);
    stmt.run(...values.map((v) => (v === undefined ? null : v)) as unknown as Parameters<typeof stmt.run>);

    // Update tags if provided
    if (updates.tags !== undefined) {
      db.prepare('DELETE FROM memory_tags WHERE memory_id = ?').run(id);
      for (const tag of updates.tags) {
        db.prepare('INSERT OR IGNORE INTO memory_tags (memory_id, tag_name) VALUES (?, ?)').run(
          id,
          tag,
        );
      }
    }
  }

  async deleteMemory(id: string): Promise<void> {
    const db = this.ensureInit();
    // CASCADE will handle segments, segments_fts, segments_vec, memory_tags
    // But we need to clean up FTS and vec manually since they're virtual tables
    const segments = db.prepare('SELECT id FROM segments WHERE memory_id = ?').all(id) as Array<{ id: string }>;
    for (const seg of segments) {
      try { db.prepare('DELETE FROM segments_fts WHERE id = ?').run(seg.id); } catch {}
      try { db.prepare('DELETE FROM segments_vec WHERE id = ?').run(seg.id); } catch {}
    }
    db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  // ─── Search ───

  async search(query: string, config?: Partial<SearchConfig>): Promise<SearchResult[]> {
    return this.searchEngine!.search(query);
  }

  // ─── Similarity (for Merger Agent) ───

  async findSimilarMemories(
    content: string,
    options?: { topK?: number; minSimilarity?: number; tags?: string[] },
  ): Promise<SimilarMemory[]> {
    const db = this.ensureInit();
    const topK = options?.topK ?? 3;
    const minSimilarity = options?.minSimilarity ?? 0.7;

    const queryVec = await this.embedding.embed(content);

    // Vector search for candidates
    const vectorResults = await this.searchEngine!.vectorSearch(queryVec, topK * 3);

    // Get full memories for results
    const results: SimilarMemory[] = [];
    const seenIds = new Set<string>();

    for (const result of vectorResults) {
      if (seenIds.has(result.memoryId)) continue;
      seenIds.add(result.memoryId);

      const memory = await this.getMemory(result.memoryId);
      if (!memory || memory.status !== 'active') continue;

      // Compute combined score with tag overlap
      let tagOverlap = 0;
      if (options?.tags && memory.tags.length > 0) {
        tagOverlap = jaccardSimilarity(
          new Set(options.tags),
          new Set(memory.tags),
        );
      }

      const combinedScore =
        options?.tags
          ? 0.6 * result.score + 0.4 * tagOverlap
          : result.score;

      if (combinedScore >= minSimilarity) {
        results.push({
          memory,
          similarity: combinedScore,
          matchReason: options?.tags ? 'hybrid' : 'vector',
        });
      }

      if (results.length >= topK) break;
    }

    return results.toSorted((a, b) => b.similarity - a.similarity);
  }

  // ─── Tags ───

  async resolveTags(candidates: string[]): Promise<string[]> {
    return this.tagService!.resolveTags(candidates);
  }

  async getTags(): Promise<Tag[]> {
    return this.tagService!.getTags();
  }

  async getTagsByPrefix(prefix: string): Promise<Tag[]> {
    return this.tagService!.getTagsByPrefix(prefix);
  }

  // ─── Conflicts ───

  async createConflict(newMemoryId: string, existingMemoryIds: string[], reason: string): Promise<Conflict> {
    const db = this.ensureInit();
    const id = generateId();
    const now = new Date().toISOString();
    const memoryIds = [newMemoryId, ...existingMemoryIds];

    db.prepare(
      `INSERT INTO conflicts (id, memory_ids, reason, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
    ).run(id, JSON.stringify(memoryIds), reason, now);

    // New memory stays active; existing memories are flagged for review
    for (const mid of existingMemoryIds) {
      await this.updateMemory(mid, { status: 'conflict' });
    }

    return {
      id,
      memoryIds,
      reason,
      status: 'pending',
      createdAt: now,
    };
  }

  async getPendingConflicts(): Promise<Conflict[]> {
    const db = this.ensureInit();
    const rows = db
      .prepare('SELECT * FROM conflicts WHERE status = ? ORDER BY created_at DESC')
      .all('pending') as unknown as ConflictRow[];
    return rows.map(this.rowToConflict);
  }

  async resolveConflict(
    conflictId: string,
    winnerId: string,
    resolution: string,
    type: ResolutionType = 'manual',
  ): Promise<void> {
    const db = this.ensureInit();
    const now = new Date().toISOString();

    const conflict = db.prepare('SELECT * FROM conflicts WHERE id = ?').get(conflictId) as unknown as ConflictRow | undefined;
    if (!conflict) throw new Error(`Conflict ${conflictId} not found`);

    const memoryIds = JSON.parse(conflict.memory_ids) as string[];

    db.prepare(
      `UPDATE conflicts SET status = 'resolved', resolution = ?, resolution_type = ?, winner_id = ?, resolved_at = ? WHERE id = ?`,
    ).run(resolution, type, winnerId, now, conflictId);

    // Winner stays active; losers become superseded with reduced confidence
    for (const mid of memoryIds) {
      if (mid === winnerId) {
        await this.updateMemory(mid, { status: 'active' });
      } else {
        const loser = await this.getMemory(mid);
        const newConfidence = Math.round(Math.max(0.1, (loser?.confidence ?? 0.8) - 0.3) * 100) / 100;
        await this.updateMemory(mid, { status: 'superseded', confidence: newConfidence });
      }
    }
  }

  async reopenConflict(conflictId: string): Promise<void> {
    const db = this.ensureInit();
    const now = new Date().toISOString();

    const conflict = db.prepare('SELECT * FROM conflicts WHERE id = ?').get(conflictId) as unknown as ConflictRow | undefined;
    if (!conflict) throw new Error(`Conflict ${conflictId} not found`);

    db.prepare(
      `UPDATE conflicts SET status = 'pending', resolution = NULL, resolution_type = NULL, winner_id = NULL, resolved_at = NULL WHERE id = ?`,
    ).run(conflictId);

    // Re-mark existing memories as conflict; new memory (first in array) stays active
    const memoryIds = JSON.parse(conflict.memory_ids) as string[];
    for (let i = 1; i < memoryIds.length; i++) {
      await this.updateMemory(memoryIds[i], { status: 'conflict' });
    }
  }

  // ─── Knowledge Chain ───

  async getMemoryChain(chainRootId: string): Promise<Memory[]> {
    const db = this.ensureInit();
    const rows = db
      .prepare('SELECT * FROM memories WHERE chain_root_id = ? ORDER BY created_at ASC')
      .all(chainRootId) as unknown as MemoryRow[];
    return Promise.all(rows.map((row) => this.rowToMemory(row)));
  }

  // ─── Helpers ───

  private async rowToMemory(row: MemoryRow): Promise<Memory> {
    const db = this.ensureInit();
    const tagRows = db
      .prepare('SELECT tag_name FROM memory_tags WHERE memory_id = ?')
      .all(row.id) as Array<{ tag_name: string }>;

    return {
      id: row.id,
      title: row.title ?? undefined,
      content: row.content,
      summary: row.summary ?? undefined,
      keyPoints: row.key_points ? JSON.parse(row.key_points) : undefined,
      embedding: row.embedding ? parseEmbedding(row.embedding) : undefined,
      confidence: row.confidence,
      status: row.status as Memory['status'],
      chainRootId: row.chain_root_id ?? undefined,
      clusterId: row.cluster_id ?? undefined,
      accessCount: row.access_count,
      source: row.source ?? undefined,
      tags: tagRows.map((t) => t.tag_name),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToConflict(row: ConflictRow): Conflict {
    return {
      id: row.id,
      memoryIds: JSON.parse(row.memory_ids),
      reason: row.reason ?? undefined,
      status: row.status as Conflict['status'],
      resolution: row.resolution ?? undefined,
      resolutionType: (row.resolution_type as ResolutionType) ?? undefined,
      winnerId: row.winner_id ?? undefined,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at ?? undefined,
    };
  }
}
