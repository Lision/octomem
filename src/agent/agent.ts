/**
 * MemoryAgent — deterministic dispatcher that orchestrates pipeline functions.
 *
 * Not an autonomous agent — it's a high-level API that calls the right
 * pipeline functions in the right order based on the requested operation.
 */

import type { Model } from '@mariozechner/pi-ai';
import { MemoryStore } from '../core/storage/store.js';
import { StagingManager } from '../core/staging/staging.js';
import * as pipeline from '../pipeline/index.js';
import type { AgentConfig } from './types.js';
import type {
  AddMemoryInput,
  AddMemoryOutput,
  SearchInput,
  EnrichedSearchResult,
  BatchImportInput,
  BatchImportOutput,
  ExportInput,
  ExportOutput,
  ResolveConflictInput,
  ResolveConflictOutput,
  FormatInput,
  FormatOutput,
  StructurizeInput,
  StructurizeOutput,
  ValidateInput,
  ValidateOutput,
  MergeInput,
  MergeOutput,
  IndexInput,
  IndexOutput,
} from '../pipeline/types.js';

/** Create a Model config from AgentConfig's LLM settings */
function createModelConfig(config: AgentConfig): Model<'openai-completions'> {
  const hasCustomLlm = Boolean(config.llm.baseUrl);

  return {
    id: config.llm.model,
    name: config.llm.model,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: hasCustomLlm
      ? config.llm.baseUrl!
      : 'https://api.openai.com/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: config.llm.maxTokens ?? 4096,
  };
}

export class MemoryAgent {
  private config: AgentConfig;
  private store: MemoryStore;
  private model: Model<'openai-completions'>;
  private rootDir: string;

  constructor(config: AgentConfig) {
    this.config = config;
    this.store = new MemoryStore(config.storage);
    this.model = createModelConfig(config);
    this.rootDir = config.paths?.rootDir ?? './memory';
  }

  /** Initialize storage */
  async init(): Promise<void> {
    await this.store.init();

    // Ensure entities directory exists
    const staging = new StagingManager(this.rootDir);
    const { mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const entitiesDir = join(this.rootDir, 'entities');
    if (!existsSync(entitiesDir)) {
      mkdirSync(entitiesDir, { recursive: true });
    }
  }

  /** Close storage */
  close(): void {
    this.store.close();
  }

  // ─── High-level operations ───

  /** Add a memory through the full pipeline */
  async addMemory(input: AddMemoryInput): Promise<AddMemoryOutput> {
    return pipeline.addMemory(input, this.store, this.model, this.rootDir);
  }

  /** Search memories */
  async search(input: SearchInput): Promise<EnrichedSearchResult[]> {
    return pipeline.search(input, this.store);
  }

  /** Batch import files */
  async batchImport(input: BatchImportInput): Promise<BatchImportOutput> {
    return pipeline.batchImport(input, this.store, this.model, this.rootDir);
  }

  /** Export memories to md files */
  async export(input: ExportInput): Promise<ExportOutput> {
    return pipeline.exportMemories(input, this.store, this.rootDir);
  }

  /** Resolve a conflict */
  async resolveConflict(input: ResolveConflictInput): Promise<ResolveConflictOutput> {
    return pipeline.resolveConflict(input, this.store);
  }

  // ─── Direct pipeline function access ───

  get fn() {
    return {
      format: (input: FormatInput) => pipeline.format(input, this.model),
      structurize: (input: StructurizeInput) => pipeline.structurize(input, this.model),
      validate: (input: ValidateInput) => pipeline.validate(input, this.store, this.model),
      merge: (input: MergeInput) => pipeline.merge(input, this.model),
      indexMemory: (input: IndexInput) => pipeline.indexMemory(input, this.store, this.rootDir),
      search: (input: SearchInput) => pipeline.search(input, this.store),
    };
  }

  // ─── Raw store access (escape hatch) ───

  get rawStore(): MemoryStore {
    return this.store;
  }
}
