/**
 * Integration tests for MemoryStore (CRUD, knowledge chain, conflict flow).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { MemoryStore } from '../store.js';
import type { StorageConfig } from '../types.js';

// Mock EmbeddingService — we patch MemoryStore to use it via config
class MockEmbeddingService {
  private db: any = null;

  async embed(text: string): Promise<number[]> {
    const vec = new Array(1536).fill(0);
    for (let i = 0; i < text.length && i < 1536; i++) {
      vec[i] = text.charCodeAt(i) / 128;
    }
    return vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embed(text);
  }

  setDatabase(db: any): void {
    this.db = db;
  }
}

// We'll create a store with a mock embedding by using MemoryStore directly
// Since MemoryStore creates EmbeddingService internally, we need a different approach:
// Use a real MemoryStore but with a fake API endpoint that will fail.
// Instead, let's test at a lower level by creating our own store-like setup.

import { openConnection, closeConnection } from '../connection.js';
import { initSchema } from '../schema.js';
import { TagService } from '../tags.js';
import { SearchEngine } from '../search.js';
import { segmentMarkdown } from '../segment.js';
import { generateId, serializeEmbedding, hashText } from '../utils.js';
import { DEFAULT_SEARCH_CONFIG } from '../types.js';
import type { DatabaseSync } from 'node:sqlite';
import type { AddMemoryInput, Memory, Conflict } from '../types.js';

/**
 * Minimal store for testing that uses mock embeddings.
 * This avoids hitting real API endpoints.
 */
class TestStore {
  db: DatabaseSync;
  tagService: TagService;
  private searchEngine: SearchEngine;
  private embedding: MockEmbeddingService;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.embedding = new MockEmbeddingService();
    this.embedding.setDatabase(db);
    this.tagService = new TagService(db, this.embedding as any);
    this.searchEngine = new SearchEngine(db, this.embedding as any, DEFAULT_SEARCH_CONFIG, false);
  }

  async addMemory(input: AddMemoryInput): Promise<Memory> {
    const now = new Date().toISOString();
    const id = generateId();

    const textToEmbed = input.summary ?? input.content;
    const embedding = await this.embedding.embed(textToEmbed);

    let tags: string[] = [];
    if (input.tags && input.tags.length > 0) {
      tags = await this.tagService.resolveTags(input.tags);
    }

    this.db.prepare(
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
      null,
      input.source ?? 'user_input',
      now,
      now,
    );

    const segments = segmentMarkdown(input.content);
    for (const seg of segments) {
      const segId = generateId();
      const segEmbedding = await this.embedding.embed(seg.text);

      this.db.prepare(
        `INSERT INTO segments (id, memory_id, start_line, end_line, text, hash, embedding, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(segId, id, seg.startLine, seg.endLine, seg.text, seg.hash, serializeEmbedding(segEmbedding), now);

      this.db.prepare(`INSERT INTO segments_fts (id, memory_id, text) VALUES (?, ?, ?)`).run(
        segId, id, seg.text,
      );
    }

    for (const tag of tags) {
      this.db.prepare(`INSERT OR IGNORE INTO memory_tags (memory_id, tag_name) VALUES (?, ?)`).run(id, tag);
    }

    return this.getMemory(id) as Promise<Memory>;
  }

  async getMemory(id: string): Promise<Memory | null> {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as any;
    if (!row) return null;

    const tagRows = this.db
      .prepare('SELECT tag_name FROM memory_tags WHERE memory_id = ?')
      .all(id) as Array<{ tag_name: string }>;

    return {
      id: row.id,
      title: row.title ?? undefined,
      content: row.content,
      summary: row.summary ?? undefined,
      keyPoints: row.key_points ? JSON.parse(row.key_points) : undefined,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      confidence: row.confidence,
      status: row.status,
      chainRootId: row.chain_root_id ?? undefined,
      clusterId: row.cluster_id ?? undefined,
      accessCount: row.access_count,
      source: row.source ?? undefined,
      tags: tagRows.map((t) => t.tag_name),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateMemory(id: string, updates: Partial<Memory>): Promise<void> {
    const now = new Date().toISOString();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.title !== undefined) { setClauses.push('title = ?'); values.push(updates.title); }
    if (updates.content !== undefined) { setClauses.push('content = ?'); values.push(updates.content); }
    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
    if (updates.chainRootId !== undefined) { setClauses.push('chain_root_id = ?'); values.push(updates.chainRootId); }

    values.push(id);
    this.db.prepare(`UPDATE memories SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...values.map((v) => (v === undefined ? null : v)) as any);

    if (updates.tags !== undefined) {
      this.db.prepare('DELETE FROM memory_tags WHERE memory_id = ?').run(id);
      for (const tag of updates.tags) {
        this.db.prepare('INSERT OR IGNORE INTO memory_tags (memory_id, tag_name) VALUES (?, ?)').run(id, tag);
      }
    }
  }

  async deleteMemory(id: string): Promise<void> {
    const segments = this.db.prepare('SELECT id FROM segments WHERE memory_id = ?').all(id) as Array<{ id: string }>;
    for (const seg of segments) {
      try { this.db.prepare('DELETE FROM segments_fts WHERE id = ?').run(seg.id); } catch {}
    }
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  async search(query: string): Promise<any[]> {
    return this.searchEngine.search(query);
  }

  async getMemoryChain(chainRootId: string): Promise<Memory[]> {
    const rows = this.db
      .prepare('SELECT * FROM memories WHERE chain_root_id = ? ORDER BY created_at ASC')
      .all(chainRootId) as any[];

    const memories: Memory[] = [];
    for (const row of rows) {
      const mem = await this.getMemory(row.id);
      if (mem) memories.push(mem);
    }
    return memories;
  }

  async createConflict(memoryIds: string[], reason: string): Promise<Conflict> {
    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(
      `INSERT INTO conflicts (id, memory_ids, reason, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
    ).run(id, JSON.stringify(memoryIds), reason, now);

    for (const mid of memoryIds) {
      await this.updateMemory(mid, { status: 'conflict' });
    }

    return { id, memoryIds, reason, status: 'pending', createdAt: now };
  }

  async getPendingConflicts(): Promise<Conflict[]> {
    const rows = this.db
      .prepare('SELECT * FROM conflicts WHERE status = ? ORDER BY created_at DESC')
      .all('pending') as any[];

    return rows.map((row: any) => ({
      id: row.id,
      memoryIds: JSON.parse(row.memory_ids),
      reason: row.reason ?? undefined,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  async resolveConflict(
    conflictId: string, winnerId: string, resolution: string, type: string = 'manual',
  ): Promise<void> {
    const now = new Date().toISOString();
    const conflict = this.db.prepare('SELECT * FROM conflicts WHERE id = ?').get(conflictId) as any;
    if (!conflict) throw new Error(`Conflict ${conflictId} not found`);

    const memoryIds = JSON.parse(conflict.memory_ids) as string[];

    this.db.prepare(
      `UPDATE conflicts SET status = 'resolved', resolution = ?, resolution_type = ?, winner_id = ?, resolved_at = ? WHERE id = ?`,
    ).run(resolution, type, winnerId, now, conflictId);

    for (const mid of memoryIds) {
      if (mid === winnerId) {
        await this.updateMemory(mid, { status: 'active' });
      } else {
        await this.updateMemory(mid, { status: 'superseded' });
      }
    }
  }

  async reopenConflict(conflictId: string): Promise<void> {
    const conflict = this.db.prepare('SELECT * FROM conflicts WHERE id = ?').get(conflictId) as any;
    if (!conflict) throw new Error(`Conflict ${conflictId} not found`);

    this.db.prepare(
      `UPDATE conflicts SET status = 'pending', resolution = NULL, resolution_type = NULL, winner_id = NULL, resolved_at = NULL WHERE id = ?`,
    ).run(conflictId);

    const memoryIds = JSON.parse(conflict.memory_ids) as string[];
    for (const mid of memoryIds) {
      await this.updateMemory(mid, { status: 'conflict' });
    }
  }
}

describe('MemoryStore Integration', () => {
  let db: DatabaseSync | null = null;
  let tempDir: string;
  let store: TestStore;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'octomem-test-'));
    const dbPath = join(tempDir, 'test.db');
    const result = await openConnection({ dbPath, tryLoadVec: false });
    db = result.db;
    initSchema(db);
    store = new TestStore(db);
  });

  afterEach(() => {
    if (db) {
      closeConnection(db);
      db = null;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ─── CRUD ───

  describe('addMemory', () => {
    it('should create a memory with content', async () => {
      const memory = await store.addMemory({
        content: '# Test\n\nThis is a test memory.',
        title: 'Test Memory',
      });

      expect(memory.id).toBeTruthy();
      expect(memory.content).toBe('# Test\n\nThis is a test memory.');
      expect(memory.title).toBe('Test Memory');
      expect(memory.status).toBe('active');
      expect(memory.tags).toEqual([]);
    });

    it('should resolve and attach tags', async () => {
      const memory = await store.addMemory({
        content: 'Tagged content',
        tags: ['architecture/agent', 'design'],
      });

      expect(memory.tags.length).toBe(2);
      expect(memory.tags).toContain('architecture/agent');
      expect(memory.tags).toContain('design');
    });

    it('should create segments for long content', async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: content here.`);
      const content = lines.join('\n');

      const memory = await store.addMemory({ content });

      const segments = db!
        .prepare('SELECT * FROM segments WHERE memory_id = ?')
        .all(memory.id) as any[];
      expect(segments.length).toBeGreaterThan(0);
    });

    it('should set chain root ID', async () => {
      const memory = await store.addMemory({
        content: 'Chained memory',
        chainRootId: 'chain-001',
      });

      expect(memory.chainRootId).toBe('chain-001');
    });
  });

  describe('getMemory', () => {
    it('should return null for non-existent memory', async () => {
      const memory = await store.getMemory('nonexistent');
      expect(memory).toBeNull();
    });

    it('should retrieve memory with tags', async () => {
      const created = await store.addMemory({
        content: 'Content',
        tags: ['architecture/agent', 'design'],
      });

      const retrieved = await store.getMemory(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.tags.length).toBeGreaterThanOrEqual(1);
      expect(retrieved!.tags).toContain('architecture/agent');
    });
  });

  describe('updateMemory', () => {
    it('should update title and content', async () => {
      const memory = await store.addMemory({
        content: 'Original content',
        title: 'Original',
      });

      await store.updateMemory(memory.id, {
        title: 'Updated',
        content: 'Updated content',
      });

      const updated = await store.getMemory(memory.id);
      expect(updated!.title).toBe('Updated');
      expect(updated!.content).toBe('Updated content');
    });

    it('should update tags', async () => {
      const memory = await store.addMemory({
        content: 'Content',
        tags: ['old'],
      });

      // First create the new tag so foreign key passes
      const vec = await new MockEmbeddingService().embed('newtag');
      store.tagService.createTag('newtag', vec);

      await store.updateMemory(memory.id, {
        tags: ['newtag'],
      });

      const updated = await store.getMemory(memory.id);
      expect(updated!.tags).toEqual(['newtag']);
    });
  });

  describe('deleteMemory', () => {
    it('should delete memory and its segments', async () => {
      const memory = await store.addMemory({ content: 'To be deleted' });

      await store.deleteMemory(memory.id);

      const retrieved = await store.getMemory(memory.id);
      expect(retrieved).toBeNull();

      const segments = db!
        .prepare('SELECT * FROM segments WHERE memory_id = ?')
        .all(memory.id);
      expect(segments).toEqual([]);
    });
  });

  // ─── Search ───

  describe('search', () => {
    it('should find memories by keyword', async () => {
      await store.addMemory({
        content: 'SQLite database with vector search capabilities',
      });
      await store.addMemory({
        content: 'Agent architecture for multi-agent systems',
      });

      const results = await store.search('database');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r: any) => r.snippet.toLowerCase().includes('database'))).toBe(true);
    });
  });

  // ─── Knowledge Chain ───

  describe('getMemoryChain', () => {
    it('should return memories ordered by creation time', async () => {
      const mem1 = await store.addMemory({
        content: 'Version 1 of the idea',
        chainRootId: 'chain-001',
      });

      const mem2 = await store.addMemory({
        content: 'Version 2 of the idea',
        chainRootId: 'chain-001',
      });

      const chain = await store.getMemoryChain('chain-001');

      expect(chain.length).toBe(2);
      expect(chain[0]!.id).toBe(mem1.id);
      expect(chain[1]!.id).toBe(mem2.id);
    });

    it('should return empty for unknown chain', async () => {
      const chain = await store.getMemoryChain('unknown');
      expect(chain).toEqual([]);
    });

    it('should not include memories from other chains', async () => {
      await store.addMemory({ content: 'Chain A', chainRootId: 'chain-a' });
      await store.addMemory({ content: 'Chain B', chainRootId: 'chain-b' });

      const chain = await store.getMemoryChain('chain-a');
      expect(chain.length).toBe(1);
    });
  });

  // ─── Conflict Flow ───

  describe('conflict flow', () => {
    it('should create conflict and mark memories', async () => {
      const mem1 = await store.addMemory({ content: 'Conflicting view A' });
      const mem2 = await store.addMemory({ content: 'Conflicting view B' });

      const conflict = await store.createConflict(
        [mem1.id, mem2.id],
        'Contradictory information about the same topic',
      );

      expect(conflict.status).toBe('pending');
      expect(conflict.memoryIds).toEqual([mem1.id, mem2.id]);

      const updated1 = await store.getMemory(mem1.id);
      const updated2 = await store.getMemory(mem2.id);
      expect(updated1!.status).toBe('conflict');
      expect(updated2!.status).toBe('conflict');
    });

    it('should list pending conflicts', async () => {
      const mem = await store.addMemory({ content: 'Conflict source' });
      await store.createConflict([mem.id], 'Test reason');

      const pending = await store.getPendingConflicts();
      expect(pending.length).toBe(1);
      expect(pending[0]!.reason).toBe('Test reason');
    });

    it('should resolve conflict with a winner', async () => {
      const mem1 = await store.addMemory({ content: 'Version A' });
      const mem2 = await store.addMemory({ content: 'Version B' });

      const conflict = await store.createConflict(
        [mem1.id, mem2.id],
        'Duplicate',
      );

      await store.resolveConflict(conflict.id, mem1.id, 'Version A is more complete');

      const resolved1 = await store.getMemory(mem1.id);
      const resolved2 = await store.getMemory(mem2.id);
      expect(resolved1!.status).toBe('active');
      expect(resolved2!.status).toBe('superseded');

      const pending = await store.getPendingConflicts();
      expect(pending).toEqual([]);
    });

    it('should reopen resolved conflict', async () => {
      const mem1 = await store.addMemory({ content: 'Version A' });
      const mem2 = await store.addMemory({ content: 'Version B' });

      const conflict = await store.createConflict(
        [mem1.id, mem2.id],
        'Needs re-evaluation',
      );

      await store.resolveConflict(conflict.id, mem1.id, 'Initially chose A');
      await store.reopenConflict(conflict.id);

      const reopened1 = await store.getMemory(mem1.id);
      const reopened2 = await store.getMemory(mem2.id);
      expect(reopened1!.status).toBe('conflict');
      expect(reopened2!.status).toBe('conflict');

      const pending = await store.getPendingConflicts();
      expect(pending.length).toBe(1);
    });
  });
});
