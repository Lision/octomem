/**
 * Configuration types for the MemoryAgent.
 */

import type { StorageConfig, EmbeddingConfig } from '../core/storage/types.js';

/** LLM provider configuration (OpenAI-compatible) */
export interface LlmConfig {
  baseUrl?: string;
  apiKey?: string;
  /** Model for simple pipeline functions (format, structurize, validate, merge) */
  model: string;
  /** Model for complex tasks (self-iterate, conflict resolution). Falls back to model. */
  strongModel?: string;
  maxTokens?: number;
}

/** Root data directory configuration */
export interface StoragePaths {
  /** Root directory for all user data. Default: ./memory */
  rootDir: string;
}

/** MemoryAgent configuration */
export interface AgentConfig {
  storage: StorageConfig;
  llm: LlmConfig;
  paths?: Partial<StoragePaths>;
}

/** Default agent config values */
export const DEFAULT_AGENT_CONFIG = {
  paths: {
    rootDir: './memory',
  },
} as const;
