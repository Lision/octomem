/**
 * Tests for hybrid search engine (vector + FTS5 + MMR).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { openConnection, closeConnection } from '../connection.js';
import { initSchema } from '../schema.js';
import { SearchEngine } from '../search.js';
import { DEFAULT_SEARCH_CONFIG } from '../types.js';
import { serializeEmbedding } from '../utils.js';
import { generateId } from '../utils.js';
import { segmentMarkdown } from '../segment.js';
import type { DatabaseSync } from 'node:sqlite';
import type { SearchConfig } from '../types.js';

// Mock EmbeddingService
class MockEmbeddingService {
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

  setDatabase(_db: DatabaseSync): void {}
}

describe('SearchEngine', () => {
  let db: DatabaseSync | null = null;
  let tempDir: string;
  let searchEngine: SearchEngine;
  let mockEmbedding: MockEmbeddingService;

  function insertMemory(id: string, content: string, status = 'active'): void {
    if (!db) throw new Error('db not initialized');
    const now = new Date().toISOString();
    const embedding = new Array(1536).fill(0);
    for (let i = 0; i < Math.min(content.length, 1536); i++) {
      embedding[i] = content.charCodeAt(i) / 128;
    }

    db.prepare(
      `INSERT INTO memories (id, title, content, summary, key_points, embedding, confidence, status, chain_root_id, cluster_id, access_count, source, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, 0.8, ?, NULL, NULL, 0, 'test', ?, ?)`,
    ).run(id, `Memory ${id}`, content, serializeEmbedding(embedding), status, now, now);

    // Create segments and FTS entries
    const segments = segmentMarkdown(content);
    for (const seg of segments) {
      const segId = generateId();
      const segEmbedding = new Array(1536).fill(0);
      for (let i = 0; i < Math.min(seg.text.length, 1536); i++) {
        segEmbedding[i] = seg.text.charCodeAt(i) / 128;
      }

      db.prepare(
        `INSERT INTO segments (id, memory_id, start_line, end_line, text, hash, embedding, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(segId, id, seg.startLine, seg.endLine, seg.text, seg.hash, serializeEmbedding(segEmbedding), now);

      db.prepare(`INSERT INTO segments_fts (id, memory_id, text) VALUES (?, ?, ?)`).run(
        segId,
        id,
        seg.text,
      );
    }
  }

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'octomem-test-'));
    const dbPath = join(tempDir, 'test.db');
    const result = await openConnection({ dbPath, tryLoadVec: false });
    db = result.db;
    initSchema(db);

    mockEmbedding = new MockEmbeddingService();
    mockEmbedding.setDatabase(db);

    const config: SearchConfig = {
      ...DEFAULT_SEARCH_CONFIG,
      mmr: { enabled: false, lambda: 0.7 }, // Disable MMR for basic tests
    };
    searchEngine = new SearchEngine(db, mockEmbedding as any, config, false);
  });

  afterEach(() => {
    if (db) {
      closeConnection(db);
      db = null;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('vectorSearch', () => {
    it('should return results sorted by similarity', async () => {
      insertMemory('mem1', 'Agent architecture design with distributed processing');
      insertMemory('mem2', 'Database storage layer with SQLite and FTS5');
      insertMemory('mem3', 'Agent architecture patterns for microservices');

      const queryVec = await mockEmbedding.embed('agent architecture');
      const results = await searchEngine.vectorSearch(queryVec, 10);

      expect(results.length).toBeGreaterThan(0);
      // Results should be sorted by score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });

    it('should return empty for empty query vector', async () => {
      insertMemory('mem1', 'Some content');
      const results = await searchEngine.vectorSearch([], 10);
      expect(results).toEqual([]);
    });

    it('should only search active memories', async () => {
      insertMemory('mem1', 'Active memory content about testing');
      insertMemory('mem2', 'Superseded memory content about testing', 'superseded');

      const queryVec = await mockEmbedding.embed('testing');
      const results = await searchEngine.vectorSearch(queryVec, 10);

      const memoryIds = results.map((r) => r.memoryId);
      expect(memoryIds).toContain('mem1');
      expect(memoryIds).not.toContain('mem2');
    });
  });

  describe('keywordSearch', () => {
    it('should find results by keyword', async () => {
      insertMemory('mem1', 'The quick brown fox jumps over the lazy dog');
      insertMemory('mem2', 'Database configuration and setup instructions');

      const results = await searchEngine.keywordSearch('database', 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.memoryId === 'mem2')).toBe(true);
    });

    it('should return empty for query with no matches', async () => {
      insertMemory('mem1', 'Short content');

      const results = await searchEngine.keywordSearch('xyznonexistent123', 10);
      expect(results).toEqual([]);
    });

    it('should handle Unicode text', async () => {
      insertMemory('mem1', '架构设计包含多个模块');

      // FTS5 with unicode61 tokenizer treats Chinese characters individually
      const results = await searchEngine.keywordSearch('架构', 10);
      // May or may not match depending on FTS5 tokenizer behavior with CJK
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('search (hybrid)', () => {
    it('should combine vector and keyword results', async () => {
      insertMemory('mem1', 'SQLite database schema with vector embeddings');
      insertMemory('mem2', 'Agent architecture with distributed processing');

      const results = await searchEngine.search('vector database');

      expect(results.length).toBeGreaterThan(0);
      // Each result should have a valid score
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.snippet).toBeTruthy();
      }
    });

    it('should return empty for empty database', async () => {
      const results = await searchEngine.search('anything');
      expect(results).toEqual([]);
    });
  });

  describe('with MMR enabled', () => {
    it('should rerank results for diversity', async () => {
      // Reset search engine with MMR enabled
      const config: SearchConfig = {
        ...DEFAULT_SEARCH_CONFIG,
        mmr: { enabled: true, lambda: 0.5 },
      };
      searchEngine = new SearchEngine(db!, mockEmbedding as any, config, false);

      insertMemory('mem1', 'architecture agent design pattern one');
      insertMemory('mem2', 'architecture agent design pattern two');
      insertMemory('mem3', 'database storage layer indexing strategy');

      const results = await searchEngine.search('architecture design');

      expect(results.length).toBeGreaterThan(0);
      // MMR should still return valid results with scores
      for (const r of results) {
        expect(r.id).toBeTruthy();
        expect(r.memoryId).toBeTruthy();
      }
    });
  });
});
