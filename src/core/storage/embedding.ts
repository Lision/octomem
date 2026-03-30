/**
 * Embedding service using OpenAI-compatible API.
 *
 * Configuration is independent from LLM config (EMBEDDING_BASE_URL, EMBEDDING_API_KEY, EMBEDDING_MODEL).
 * Not all OpenAI-compatible providers support /v1/embeddings (e.g., Zhipu).
 */

import type { EmbeddingConfig } from './types.js';
import { hashText, parseEmbedding, sanitizeAndNormalizeEmbedding, serializeEmbedding } from './utils.js';
import type { DatabaseSync } from 'node:sqlite';

export class EmbeddingService {
  private config: EmbeddingConfig;
  private db: DatabaseSync | null = null;

  constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  /** Set the database connection for caching. */
  setDatabase(db: DatabaseSync): void {
    this.db = db;
  }

  /** Get the model name. */
  get model(): string {
    return this.config.model;
  }

  /** Generate embedding for a single text. */
  async embed(text: string): Promise<number[]> {
    const contentHash = hashText(text);

    // Check cache first
    const cached = this.getCached(contentHash);
    if (cached) {
      return cached;
    }

    const embeddings = await this.callApi([text]);
    const result = embeddings[0] ?? [];

    // Cache the result
    this.setCache(contentHash, result);

    return result;
  }

  /** Generate embeddings for multiple texts. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const batchSize = this.config.maxBatchSize ?? 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      // Check cache for each text
      const uncachedIndices: number[] = [];
      const uncachedTexts: string[] = [];

      for (let j = 0; j < batch.length; j++) {
        const contentHash = hashText(batch[j]!);
        const cached = this.getCached(contentHash);
        if (cached) {
          results[i + j] = cached;
        } else {
          uncachedIndices.push(i + j);
          uncachedTexts.push(batch[j]!);
        }
      }

      if (uncachedTexts.length > 0) {
        const embeddings = await this.callApi(uncachedTexts);
        for (let k = 0; k < embeddings.length; k++) {
          const idx = uncachedIndices[k]!;
          const embedding = embeddings[k] ?? [];
          results[idx] = embedding;

          const contentHash = hashText(uncachedTexts[k]!);
          this.setCache(contentHash, embedding);
        }
      }
    }

    return results;
  }

  /** Generate embedding for a search query. */
  async embedQuery(text: string): Promise<number[]> {
    return this.embed(text);
  }

  /** Retrieve cached embedding by content hash. */
  private getCached(contentHash: string): number[] | null {
    if (!this.db) return null;

    const row = this.db
      .prepare('SELECT embedding FROM embedding_cache WHERE model = ? AND content_hash = ?')
      .get(this.config.model, contentHash) as { embedding: string } | undefined;

    if (!row) return null;
    return parseEmbedding(row.embedding);
  }

  /** Store embedding in cache. */
  private setCache(contentHash: string, embedding: number[]): void {
    if (!this.db || embedding.length === 0) return;

    this.db
      .prepare(
        'INSERT OR REPLACE INTO embedding_cache (model, content_hash, embedding, dims, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        this.config.model,
        contentHash,
        serializeEmbedding(embedding),
        embedding.length,
        new Date().toISOString()
      );
  }

  /** Call the OpenAI-compatible embeddings API. */
  private async callApi(texts: string[]): Promise<number[][]> {
    const baseUrl = this.config.baseUrl?.replace(/\/$/, '') ?? 'https://api.openai.com/v1';
    const url = `${baseUrl}/embeddings`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Embedding API error (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((item) => sanitizeAndNormalizeEmbedding(item.embedding));
  }
}
