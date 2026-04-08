/**
 * Octomem - Universal Agent Memory System
 *
 * An octopus brain architecture for AI cognition with:
 * - Long-term memory with self-consistency
 * - Content association and similarity merging
 * - Contradiction verification and truth preservation
 */

// Agent
export { MemoryAgent } from './agent/index.js';
export type { AgentConfig, LlmConfig, StoragePaths } from './agent/index.js';

// Pipeline functions (for direct usage)
export {
  format,
  structurize,
  validate,
  merge,
  indexMemory,
  search,
  addMemory,
  batchImport,
  resolveConflict,
  exportMemories,
} from './pipeline/index.js';

// Pipeline types
export type {
  FormatInput,
  FormatOutput,
  StructurizeInput,
  StructurizeOutput,
  ValidateInput,
  ValidateOutput,
  ContradictionResult,
  OverlapResult,
  MergeInput,
  MergeOutput,
  IndexInput,
  IndexOutput,
  SearchInput,
  EnrichedSearchResult,
  ExportInput,
  ExportOutput,
  ResolveConflictInput,
  ResolveConflictOutput,
  AddMemoryInput,
  AddMemoryOutput,
  BatchImportInput,
  BatchImportOutput,
} from './pipeline/index.js';

// Core storage (escape hatch)
export { MemoryStore } from './core/storage/index.js';
export type {
  Memory,
  MemoryStatus,
  Conflict,
  SearchResult,
  SimilarMemory,
  StorageConfig,
  EmbeddingConfig,
  SearchConfig,
  AddMemoryInput as StoreAddMemoryInput,
} from './core/storage/index.js';
