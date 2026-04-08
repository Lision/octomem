/**
 * Input/output types for all pipeline functions.
 *
 * Each pipeline function has its own input/output interface.
 * These types are composable — the output of one stage feeds into the next.
 */

import type { Memory, SearchResult } from '../core/storage/types.js';

// ─── format() ───

export interface FormatInput {
  /** Raw content to format */
  content: string;
  /** Content type hint. 'auto' triggers detection. */
  type?: 'text' | 'markdown' | 'auto';
  /** Content source identifier (file path, URL, etc.) */
  source?: string;
}

export interface FormatOutput {
  /** Clean markdown content */
  content: string;
  /** Detected or provided content type */
  detectedType: 'text' | 'markdown';
}

// ─── structurize() ───

export interface StructurizeInput {
  /** Markdown content from format() */
  content: string;
  source?: string;
  hints?: {
    title?: string;
    tags?: string[];
  };
}

export interface StructurizeOutput {
  title: string;
  summary: string;
  keyPoints: string[];
  /** Candidate tags (before resolveTags matching) */
  tags: string[];
}

// ─── validate() ───

export interface ValidateInput {
  /** Full markdown content after format */
  content: string;
  /** Summary from structurize */
  summary: string;
  /** Key points from structurize */
  keyPoints: string[];
  /** Candidate tags from structurize */
  tags: string[];
}

export interface ContradictionResult {
  existingMemoryId: string;
  existingSummary: string;
  /** Specific conflicting fact points */
  conflictingPoints: string[];
  /** high=factual conflict, medium=different angle, low=detail difference */
  severity: 'high' | 'medium' | 'low';
}

export interface OverlapResult {
  existingMemoryId: string;
  existingSummary: string;
  overlapScore: number;
  overlappingTopics: string[];
}

export interface ValidateOutput {
  /** true when no severe contradictions found */
  valid: boolean;
  contradictions: ContradictionResult[];
  overlaps: OverlapResult[];
  /** Suggested initial confidence for the new content */
  confidence: number;
  recommendations: string[];
}

// ─── merge() ───

export interface MergeInput {
  /** Memories to consider for merging */
  memories: Memory[];
  /** New content triggering the merge */
  newContent?: string;
  strategy?: 'auto' | 'append' | 'supersede';
}

export interface MergeOutput {
  action: 'merged' | 'kept_separate' | 'conflict_detected';
  mergedMemory?: {
    content: string;
    title: string;
    summary: string;
    keyPoints: string[];
    tags: string[];
    confidence: number;
  };
  /** IDs of memories marked superseded */
  supersededIds: string[];
  reason: string;
}

// ─── indexMemory() ───

export interface IndexInput {
  content: string;
  title: string;
  summary: string;
  keyPoints: string[];
  /** Final tags after resolveTags() */
  tags: string[];
  confidence: number;
  source?: string;
  chainRootId?: string;
}

export interface IndexOutput {
  memory: Memory;
  /** Path to the written md file */
  filePath: string;
  segmentCount: number;
}

// ─── search() ───

export interface SearchInput {
  query: string;
  maxResults?: number;
  includeContext?: boolean;
  filterTags?: string[];
}

export interface EnrichedSearchResult {
  id: string;
  memoryId: string;
  memory: Memory;
  score: number;
  snippet: string;
  context?: string;
}

// ─── export() ───

export interface ExportInput {
  outputDir: string;
  filterTags?: string[];
  /** Only export active memories. Default: true */
  activeOnly?: boolean;
}

export interface ExportOutput {
  fileCount: number;
  outputDir: string;
  skipped: number;
}

// ─── resolveConflict() ───

export interface ResolveConflictInput {
  conflictId?: string;
  memoryIds?: string[];
  /** User's resolution hint */
  hint?: string;
}

export interface ResolveConflictOutput {
  winnerId: string;
  resolution: string;
  mergedContent?: string;
  confidence: number;
}

// ─── addMemory() orchestrator ───

export interface AddMemoryInput {
  content: string;
  title?: string;
  tags?: string[];
  source?: string;
  /** Skip format stage (content is already markdown) */
  skipFormat?: boolean;
  /** Skip validate stage */
  skipValidation?: boolean;
  /** Auto-merge overlapping memories without asking */
  autoMerge?: boolean;
  chainRootId?: string;
}

export interface AddMemoryOutput {
  memory: Memory;
  filePath: string;
  /** Stages that were executed */
  stages: string[];
  /** Whether a merge happened */
  merged: boolean;
  /** Whether a conflict was created */
  conflicted: boolean;
}

// ─── batchImport() ───

export interface BatchImportInput {
  files: string[];
  pattern?: string;
  concurrency?: number;
  skipValidation?: boolean;
  autoMerge?: boolean;
}

export interface BatchImportOutput {
  total: number;
  succeeded: number;
  failed: number;
  merged: number;
  conflicted: number;
  errors: Array<{ file: string; error: string }>;
}

// ─── Pipeline context (shared across stages) ───

export interface PipelineContext {
  /** Job ID for staging */
  jobId: string;
  /** Source identifier */
  source?: string;
  /** Root data directory */
  rootDir: string;
}
