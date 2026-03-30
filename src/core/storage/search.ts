/**
 * Hybrid search engine combining vector search + FTS5 keyword search + MMR re-ranking.
 *
 * Based on OpenClaw's hybrid search pattern:
 * - Vector search: cosine similarity via sqlite-vec (fast) or JS fallback (slow but complete)
 * - Keyword search: FTS5 + BM25 ranking (always available)
 * - Hybrid scoring: weighted combination (default 0.7 vector + 0.3 text)
 * - MMR re-ranking: diversity-aware re-ranking (default enabled, λ=0.7)
 */

import type { DatabaseSync } from 'node:sqlite';
import type { EmbeddingService } from './embedding.js';
import type { SearchConfig, SearchResult } from './types.js';
import { DEFAULT_SEARCH_CONFIG } from './types.js';
import { cosineSimilarity, parseEmbedding, truncateText, vectorToBlob } from './utils.js';
import { mmrRerank } from './mmr.js';

export class SearchEngine {
  private db: DatabaseSync;
  private embedding: EmbeddingService;
  private config: SearchConfig;
  private vecAvailable: boolean;

  constructor(
    db: DatabaseSync,
    embedding: EmbeddingService,
    config: SearchConfig,
    vecAvailable: boolean,
  ) {
    this.db = db;
    this.embedding = embedding;
    this.config = config;
    this.vecAvailable = vecAvailable;
  }

  /**
   * Perform hybrid search: vector + FTS5 + optional MMR.
   */
  async search(query: string, options?: { limit?: number }): Promise<SearchResult[]> {
    const limit = options?.limit ?? this.config.maxResults;
    const candidateLimit = limit * this.config.hybrid.candidateMultiplier;

    const queryVec = await this.embedding.embedQuery(query);

    const [vectorResults, textResults] = await Promise.all([
      this.vectorSearch(queryVec, candidateLimit),
      this.keywordSearch(query, candidateLimit),
    ]);

    // Merge results by segment ID
    const byId = new Map<
      string,
      {
        id: string;
        memoryId: string;
        startLine: number;
        endLine: number;
        snippet: string;
        vectorScore: number;
        textScore: number;
      }
    >();

    for (const r of vectorResults) {
      byId.set(r.id, {
        id: r.id,
        memoryId: r.memoryId,
        startLine: r.startLine,
        endLine: r.endLine,
        snippet: r.snippet,
        vectorScore: r.score,
        textScore: 0,
      });
    }

    for (const r of textResults) {
      const existing = byId.get(r.id);
      if (existing) {
        existing.textScore = r.score;
      } else {
        byId.set(r.id, {
          id: r.id,
          memoryId: r.memoryId,
          startLine: r.startLine,
          endLine: r.endLine,
          snippet: r.snippet,
          vectorScore: 0,
          textScore: r.score,
        });
      }
    }

    const merged = Array.from(byId.values()).map((entry) => ({
      id: entry.id,
      memoryId: entry.memoryId,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score:
        this.config.hybrid.vectorWeight * entry.vectorScore +
        this.config.hybrid.textWeight * entry.textScore,
      snippet: entry.snippet,
    }));

    const sorted = merged.toSorted((a, b) => b.score - a.score);

    // MMR re-ranking
    if (this.config.mmr.enabled) {
      const mmrItems = sorted.map((r) => ({
        id: r.id,
        score: r.score,
        content: r.snippet,
      }));
      const reranked = mmrRerank(mmrItems, { enabled: true, lambda: this.config.mmr.lambda });
      const itemById = new Map(reranked.map((item, idx) => [item.id, idx]));
      return reranked
        .map((item) => sorted.find((r) => r.id === item.id)!)
        .filter(Boolean)
        .slice(0, limit);
    }

    return sorted.slice(0, limit);
  }

  /**
   * Vector search using sqlite-vec (fast) or JS fallback.
   */
  async vectorSearch(queryVec: number[], limit: number): Promise<SearchResult[]> {
    if (queryVec.length === 0 || limit <= 0) return [];

    if (this.vecAvailable) {
      try {
        const rows = this.db
          .prepare(
            `SELECT s.id, s.memory_id, s.start_line, s.end_line, s.text,
                    vec_distance_cosine(sv.embedding, ?) AS dist
             FROM segments_vec sv
             JOIN segments s ON s.id = sv.id
             WHERE s.memory_id IN (SELECT id FROM memories WHERE status = 'active')
             ORDER BY dist ASC
             LIMIT ?`,
          )
          .all(vectorToBlob(queryVec), limit) as Array<{
          id: string;
          memory_id: string;
          start_line: number;
          end_line: number;
          text: string;
          dist: number;
        }>;

        return rows.map((row) => ({
          id: row.id,
          memoryId: row.memory_id,
          startLine: row.start_line,
          endLine: row.end_line,
          score: 1 - row.dist,
          snippet: truncateText(row.text, 300),
        }));
      } catch {
        // Fall through to JS fallback
      }
    }

    // JS fallback: load all segments and compute similarity
    return this.vectorSearchFallback(queryVec, limit);
  }

  /**
   * JS cosine similarity fallback when sqlite-vec is unavailable.
   */
  private async vectorSearchFallback(queryVec: number[], limit: number): Promise<SearchResult[]> {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.memory_id, s.start_line, s.end_line, s.text, s.embedding
         FROM segments s
         WHERE s.embedding IS NOT NULL
           AND s.memory_id IN (SELECT id FROM memories WHERE status = 'active')`,
      )
      .all() as Array<{
      id: string;
      memory_id: string;
      start_line: number;
      end_line: number;
      text: string;
      embedding: string;
    }>;

    const scored = rows
      .map((row) => {
        const embedding = parseEmbedding(row.embedding);
        const score = cosineSimilarity(queryVec, embedding);
        return {
          id: row.id,
          memoryId: row.memory_id,
          startLine: row.start_line,
          endLine: row.end_line,
          score,
          snippet: truncateText(row.text, 300),
        };
      })
      .filter((r) => Number.isFinite(r.score));

    return scored.toSorted((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * FTS5 keyword search with BM25 ranking.
   */
  async keywordSearch(query: string, limit: number): Promise<SearchResult[]> {
    if (limit <= 0) return [];

    const ftsQuery = this.buildFtsQuery(query);
    if (!ftsQuery) return [];

    const rows = this.db
      .prepare(
        `SELECT fts.id, fts.memory_id, fts.text,
                bm25(segments_fts) AS rank
         FROM segments_fts fts
         WHERE fts.memory_id IN (SELECT id FROM memories WHERE status = 'active')
         ORDER BY rank ASC
         LIMIT ?`,
      )
      .all(ftsQuery, limit) as Array<{
      id: string;
      memory_id: string;
      text: string;
      rank: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      memoryId: row.memory_id,
      startLine: 0,
      endLine: 0,
      score: this.bm25RankToScore(row.rank),
      snippet: truncateText(row.text, 300),
    }));
  }

  /**
   * Build FTS5 query from raw text.
   */
  private buildFtsQuery(raw: string): string | null {
    const tokens =
      raw
        .match(/[\p{L}\p{N}_]+/gu)
        ?.map((t) => t.trim())
        .filter(Boolean) ?? [];
    if (tokens.length === 0) return null;
    const quoted = tokens.map((t) => `"${t.replaceAll('"', '')}"`);
    return quoted.join(' AND ');
  }

  /**
   * Convert BM25 rank to a 0-1 score.
   */
  private bm25RankToScore(rank: number): number {
    if (!Number.isFinite(rank)) return 1 / (1 + 999);
    if (rank < 0) {
      const relevance = -rank;
      return relevance / (1 + relevance);
    }
    return 1 / (1 + rank);
  }
}
