/**
 * Tests for tag service.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { openConnection, closeConnection } from '../connection.js';
import { initSchema } from '../schema.js';
import { TagService } from '../tags.js';
import type { DatabaseSync } from 'node:sqlite';

// Mock EmbeddingService that returns simple vectors
class MockEmbeddingService {
  private counter = 0;

  async embed(text: string): Promise<number[]> {
    // Generate a deterministic but different vector for each text
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

describe('TagService', () => {
  let db: DatabaseSync | null = null;
  let tempDir: string;
  let tagService: TagService;
  let mockEmbedding: MockEmbeddingService;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'octomem-test-'));
    const dbPath = join(tempDir, 'test.db');
    const result = await openConnection({ dbPath, tryLoadVec: false });
    db = result.db;
    initSchema(db);

    mockEmbedding = new MockEmbeddingService();
    mockEmbedding.setDatabase(db);
    tagService = new TagService(db, mockEmbedding as any);
  });

  afterEach(() => {
    if (db) {
      closeConnection(db);
      db = null;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validateTagName', () => {
    it('should accept valid two-level tags', () => {
      expect(tagService.validateTagName('architecture/agent')).toBe(true);
      expect(tagService.validateTagName('design/merge-strategy')).toBe(true);
      expect(tagService.validateTagName('test')).toBe(true);
    });

    it('should reject three-level tags', () => {
      expect(tagService.validateTagName('a/b/c')).toBe(false);
    });

    it('should reject uppercase', () => {
      expect(tagService.validateTagName('Architecture/Agent')).toBe(false);
    });

    it('should reject empty or invalid', () => {
      expect(tagService.validateTagName('')).toBe(false);
      expect(tagService.validateTagName('/')).toBe(false);
      expect(tagService.validateTagName('a/')).toBe(false);
      expect(tagService.validateTagName('/a')).toBe(false);
    });

    it('should reject special characters', () => {
      expect(tagService.validateTagName('test tag')).toBe(false);
      expect(tagService.validateTagName('test.tag')).toBe(false);
    });
  });

  describe('normalizeTagName', () => {
    it('should normalize to lowercase', () => {
      expect(tagService.normalizeTagName('Architecture/Agent')).toBe('architecture/agent');
    });

    it('should strip special characters', () => {
      expect(tagService.normalizeTagName('test tag!')).toBe('testtag');
    });
  });

  describe('createTag', () => {
    it('should create a new tag with embedding', async () => {
      const vec = await mockEmbedding.embed('test');
      const tag = tagService.createTag('test', vec);

      expect(tag.name).toBe('test');
      expect(tag.count).toBe(1);
      expect(tag.embedding).toBeDefined();
    });
  });

  describe('getTags', () => {
    it('should return all tags', async () => {
      const vec1 = await mockEmbedding.embed('tag1');
      const vec2 = await mockEmbedding.embed('tag2');
      tagService.createTag('tag1', vec1);
      tagService.createTag('tag2', vec2);

      const tags = tagService.getTags();
      expect(tags.length).toBe(2);
      expect(tags.map((t) => t.name).sort()).toEqual(['tag1', 'tag2']);
    });
  });

  describe('getTagsByPrefix', () => {
    it('should return tags matching prefix', async () => {
      const vec = await mockEmbedding.embed('test');
      tagService.createTag('architecture/agent', vec);
      tagService.createTag('architecture/storage', vec);
      tagService.createTag('design/memory', vec);

      const tags = tagService.getTagsByPrefix('architecture/');
      expect(tags.length).toBe(2);
      expect(tags.every((t) => t.name.startsWith('architecture/'))).toBe(true);
    });

    it('should return empty for non-matching prefix', () => {
      const tags = tagService.getTagsByPrefix('nonexistent/');
      expect(tags).toEqual([]);
    });
  });

  describe('resolveTag', () => {
    it('should create new tag if no similar exists', async () => {
      const tag = await tagService.resolveTag('architecture/agent');
      expect(tag).toBe('architecture/agent');

      const allTags = tagService.getTags();
      expect(allTags.length).toBe(1);
    });

    it('should reuse exact match', async () => {
      await tagService.resolveTag('test');
      const tag = await tagService.resolveTag('test');

      expect(tag).toBe('test');
      const allTags = tagService.getTags();
      expect(allTags.length).toBe(1);
      expect(allTags[0]!.count).toBe(2);
    });

    it('should reject invalid tag names', async () => {
      await expect(tagService.resolveTag('A/B/C')).rejects.toThrow('Invalid tag name');
    });
  });
});
