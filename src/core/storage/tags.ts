/**
 * Tag service with approximate matching and hierarchical support.
 *
 * Tags use lowercase English with / separator (max 2 levels: a/b).
 * Approximate matching uses embedding cosine similarity (> 0.85 threshold).
 */

import type { DatabaseSync } from 'node:sqlite';
import type { EmbeddingService } from './embedding.js';
import type { Tag, TagRow } from './types.js';
import { cosineSimilarity, parseEmbedding, serializeEmbedding } from './utils.js';

export class TagService {
  private db: DatabaseSync;
  private embedding: EmbeddingService;

  constructor(db: DatabaseSync, embedding: EmbeddingService) {
    this.db = db;
    this.embedding = embedding;
  }

  /**
   * Validate a tag name.
   * Rules: lowercase, a/b format, max 2 levels, alphanumeric + underscore + hyphen.
   */
  validateTagName(name: string): boolean {
    if (!name || name.length === 0) return false;
    if (name.startsWith('/') || name.endsWith('/')) return false;

    const parts = name.split('/');
    if (parts.length > 2) return false;

    return parts.every((part) => /^[a-z][a-z0-9_-]*$/.test(part));
  }

  /**
   * Normalize a tag name: lowercase, strip special chars.
   */
  normalizeTagName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_/-]/g, '').replace(/\/+/g, '/');
  }

  /**
   * Resolve a candidate tag via approximate matching.
   * If a similar tag exists (cosine similarity > threshold), reuse it.
   * Otherwise create a new tag.
   */
  async resolveTag(candidate: string, threshold = 0.85): Promise<string> {
    const normalized = this.normalizeTagName(candidate);

    if (!this.validateTagName(normalized)) {
      throw new Error(`Invalid tag name: "${normalized}". Must be lowercase, a/b format, max 2 levels.`);
    }

    // Try exact match first
    const existing = this.db
      .prepare('SELECT name FROM tags WHERE name = ?')
      .get(normalized) as { name: string } | undefined;

    if (existing) {
      this.incrementTagCount(normalized);
      return normalized;
    }

    // Generate embedding for approximate matching
    const candidateVec = await this.embedding.embed(normalized);

    // Find similar tags
    const similarTag = await this.findMostSimilarTag(candidateVec, threshold);
    if (similarTag) {
      this.incrementTagCount(similarTag);
      return similarTag;
    }

    // Create new tag
    this.createTag(normalized, candidateVec);
    return normalized;
  }

  /**
   * Resolve multiple candidate tags.
   */
  async resolveTags(candidates: string[], threshold = 0.85): Promise<string[]> {
    const resolved: string[] = [];
    for (const candidate of candidates) {
      const tag = await this.resolveTag(candidate, threshold);
      resolved.push(tag);
    }
    return [...new Set(resolved)];
  }

  /**
   * Create a new tag with embedding.
   */
  createTag(name: string, embedding: number[]): Tag {
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO tags (name, embedding, count, created_at) VALUES (?, ?, 1, ?)')
      .run(name, serializeEmbedding(embedding), now);

    return { name, embedding, count: 1, createdAt: now };
  }

  /**
   * Increment a tag's usage count.
   */
  incrementTagCount(name: string): void {
    this.db.prepare('UPDATE tags SET count = count + 1 WHERE name = ?').run(name);
  }

  /**
   * Get all tags.
   */
  getTags(): Tag[] {
    const rows = this.db.prepare('SELECT name, embedding, count, created_at FROM tags').all() as unknown as TagRow[];
    return rows.map((row) => ({
      name: row.name,
      embedding: row.embedding ? parseEmbedding(row.embedding) : undefined,
      count: row.count,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get tags by prefix (e.g., "architecture/*" matches "architecture/agent", "architecture/storage").
   */
  getTagsByPrefix(prefix: string): Tag[] {
    const rows = this.db
      .prepare('SELECT name, embedding, count, created_at FROM tags WHERE name LIKE ?')
      .all(`${prefix}%`) as unknown as TagRow[];
    return rows.map((row) => ({
      name: row.name,
      embedding: row.embedding ? parseEmbedding(row.embedding) : undefined,
      count: row.count,
      createdAt: row.created_at,
    }));
  }

  /**
   * Find the most similar tag above the threshold.
   */
  private async findMostSimilarTag(
    candidateVec: number[],
    threshold: number,
  ): Promise<string | null> {
    const tags = this.getTags();
    let bestMatch: string | null = null;
    let bestSimilarity = 0;

    for (const tag of tags) {
      if (!tag.embedding) continue;
      const similarity = cosineSimilarity(candidateVec, tag.embedding);
      if (similarity > threshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = tag.name;
      }
    }

    return bestMatch;
  }
}
