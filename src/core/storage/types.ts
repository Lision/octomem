/**
 * Core TypeScript interfaces for the Octomem memory storage system.
 */

/** Memory status lifecycle */
export type MemoryStatus = 'active' | 'superseded' | 'conflict' | 'gap' | 'archived';

/** Conflict resolution type */
export type ResolutionType = 'programmatic' | 'llm' | 'manual';

/** Memory record */
export interface Memory {
  id: string;
  title?: string;
  content: string;
  summary?: string;
  keyPoints?: string[];
  embedding?: number[];
  confidence: number;
  status: MemoryStatus;
  chainRootId?: string;
  clusterId?: string;
  accessCount: number;
  source?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Internal memory row (DB representation, before tag resolution) */
export interface MemoryRow {
  id: string;
  title: string | null;
  content: string;
  summary: string | null;
  key_points: string | null;
  embedding: string | null;
  confidence: number;
  status: string;
  chain_root_id: string | null;
  cluster_id: string | null;
  access_count: number;
  source: string | null;
  created_at: string;
  updated_at: string;
}

/** Search segment */
export interface Segment {
  id: string;
  memoryId: string;
  startLine: number;
  endLine: number;
  text: string;
  hash: string;
  embedding?: number[];
  createdAt: string;
}

/** Internal segment row (DB representation) */
export interface SegmentRow {
  id: string;
  memory_id: string;
  start_line: number;
  end_line: number;
  text: string;
  hash: string;
  embedding: string | null;
  created_at: string;
}

/** Tag record */
export interface Tag {
  name: string;
  embedding?: number[];
  count: number;
  createdAt: string;
}

/** Internal tag row (DB representation) */
export interface TagRow {
  name: string;
  embedding: string | null;
  count: number;
  created_at: string;
}

/** Search result */
export interface SearchResult {
  id: string;
  memoryId: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}

/** Similar memory (for Merger Agent) */
export interface SimilarMemory {
  memory: Memory;
  similarity: number;
  matchReason: 'vector' | 'tags' | 'hybrid';
}

/** Conflict record */
export interface Conflict {
  id: string;
  memoryIds: string[];
  reason?: string;
  status: 'pending' | 'resolved';
  resolution?: string;
  resolutionType?: ResolutionType;
  winnerId?: string;
  createdAt: string;
  resolvedAt?: string;
}

/** Internal conflict row (DB representation) */
export interface ConflictRow {
  id: string;
  memory_ids: string;
  reason: string | null;
  status: string;
  resolution: string | null;
  resolution_type: string | null;
  winner_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Hybrid search configuration */
export interface SearchConfig {
  maxResults: number;
  minScore: number;
  hybrid: {
    vectorWeight: number;
    textWeight: number;
    candidateMultiplier: number;
  };
  mmr: {
    enabled: boolean;
    lambda: number;
  };
}

/** Default search configuration */
export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  maxResults: 10,
  minScore: 0.3,
  hybrid: {
    vectorWeight: 0.7,
    textWeight: 0.3,
    candidateMultiplier: 4,
  },
  mmr: {
    enabled: true,
    lambda: 0.7,
  },
};

/**
 * Embedding configuration (independent from LLM configuration).
 *
 * Not all OpenAI-compatible baseURLs support /v1/embeddings (e.g., Zhipu).
 * Users can configure different providers for LLM and embedding.
 */
export interface EmbeddingConfig {
  baseUrl?: string;
  apiKey?: string;
  model: string;
  maxBatchSize?: number;
}

/** Storage initialization configuration */
export interface StorageConfig {
  dbPath: string;
  embedding: EmbeddingConfig;
  search?: Partial<SearchConfig>;
}

/** Input for adding a new memory */
export interface AddMemoryInput {
  content: string;
  title?: string;
  summary?: string;
  keyPoints?: string[];
  tags?: string[];
  confidence?: number;
  source?: string;
  chainRootId?: string;
}
