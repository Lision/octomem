/**
 * Staging types for pipeline persistence.
 *
 * Staging allows pipeline jobs to be resumed after interruption.
 * Each stage's output is persisted to disk, and a manifest tracks progress.
 */

/** Pipeline stages in execution order */
export type Stage = 'format' | 'structurize' | 'validate' | 'merge' | 'index';

/** All possible stage statuses */
export type StageStatus = 'pending' | 'completed' | 'skipped';

/** Per-stage completion record */
export interface StageRecord {
  status: StageStatus;
  /** Timestamp when the stage completed */
  completedAt?: string;
}

/** Staging manifest — tracks job progress */
export interface JobManifest {
  /** Unique job ID */
  jobId: string;
  /** Source identifier (file path, etc.) */
  source?: string;
  /** Current stage in the pipeline */
  currentStage: Stage;
  /** Per-stage status */
  stages: Record<Stage, StageStatus>;
  /** Timestamp when the job was created */
  createdAt: string;
  /** Timestamp when the job was completed (staging cleaned up) */
  completedAt?: string;
}

/** File names for each stage's output */
export const STAGE_FILES: Record<Stage, string> = {
  format: '01-formatted.md',
  structurize: '02-structured.json',
  validate: '03-validated.json',
  merge: '04-merged.json',
  index: '05-indexed.json',
} as const;
