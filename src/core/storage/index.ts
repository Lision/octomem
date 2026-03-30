/**
 * Octomem Memory Storage System — Public API
 */

export { MemoryStore } from './store.js';
export { EmbeddingService } from './embedding.js';
export { TagService } from './tags.js';
export { SearchEngine } from './search.js';
export { segmentMarkdown, DEFAULT_SEGMENT_CONFIG } from './segment.js';
export { mmrRerank, jaccardSimilarity, tokenize } from './mmr.js';
export {
  cosineSimilarity,
  hashText,
  parseEmbedding,
  serializeEmbedding,
  sanitizeAndNormalizeEmbedding,
  generateId,
} from './utils.js';
export { initSchema } from './schema.js';
export { openConnection, closeConnection } from './connection.js';

export type {
  Memory,
  Segment,
  Tag,
  Conflict,
  SearchResult,
  SimilarMemory,
  SearchConfig,
  EmbeddingConfig,
  StorageConfig,
  AddMemoryInput,
  MemoryStatus,
  ResolutionType,
} from './types.js';

export { DEFAULT_SEARCH_CONFIG } from './types.js';
