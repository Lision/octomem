/**
 * StagingManager — pipeline stage persistence for interruption recovery.
 *
 * Each pipeline job gets a staging directory under {rootDir}/staging/{jobId}/.
 * Stage outputs are written to numbered files. A manifest.json tracks progress.
 * On successful completion, the entire staging directory is deleted.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateId } from '../storage/utils.js';
import { STAGE_FILES, type JobManifest, type Stage, type StageStatus } from './types.js';

export class StagingManager {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /** Get the staging root directory */
  get stagingDir(): string {
    return join(this.rootDir, 'staging');
  }

  // ─── Job lifecycle ───

  /** Create a new staging job and return its manifest */
  createJob(source?: string): JobManifest {
    const jobId = generateId();
    const jobDir = this.getJobDir(jobId);

    mkdirSync(jobDir, { recursive: true });

    const manifest: JobManifest = {
      jobId,
      source,
      currentStage: 'format',
      stages: {
        format: 'pending',
        structurize: 'pending',
        validate: 'pending',
        merge: 'pending',
        index: 'pending',
      },
      createdAt: new Date().toISOString(),
    };

    this.writeManifest(manifest);
    return manifest;
  }

  /** Get staging directory for a job */
  getJobDir(jobId: string): string {
    return join(this.stagingDir, jobId);
  }

  /** Read a job's manifest */
  getManifest(jobId: string): JobManifest | null {
    const path = join(this.getJobDir(jobId), 'manifest.json');
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  /** Update a stage's status and advance currentStage */
  updateStage(manifest: JobManifest, stage: Stage, status: StageStatus): JobManifest {
    manifest.stages[stage] = status;
    if (status === 'completed') {
      manifest.stages[stage] = 'completed';
      // Advance to next stage
      manifest.currentStage = this.getNextStage(stage) ?? stage;
    }
    this.writeManifest(manifest);
    return manifest;
  }

  /** Write stage output to its numbered file */
  writeStageOutput(jobId: string, stage: Stage, data: string): void {
    const filename = STAGE_FILES[stage];
    const path = join(this.getJobDir(jobId), filename);
    writeFileSync(path, data, 'utf-8');
  }

  /** Read stage output from its numbered file */
  readStageOutput(jobId: string, stage: Stage): string | null {
    const filename = STAGE_FILES[stage];
    const path = join(this.getJobDir(jobId), filename);
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf-8');
  }

  /** Clean up staging directory after successful completion */
  cleanupJob(jobId: string): void {
    const jobDir = this.getJobDir(jobId);
    if (existsSync(jobDir)) {
      rmSync(jobDir, { recursive: true, force: true });
    }
  }

  /** Find all incomplete jobs (for resume) */
  getIncompleteJobs(): JobManifest[] {
    if (!existsSync(this.stagingDir)) return [];

    const dirs = readdirSync(this.stagingDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const jobs: JobManifest[] = [];
    for (const dir of dirs) {
      const manifest = this.getManifest(dir);
      if (manifest && !manifest.completedAt) {
        jobs.push(manifest);
      }
    }
    return jobs;
  }

  /** Mark a job as completed (before cleanup) */
  completeJob(manifest: JobManifest): void {
    manifest.completedAt = new Date().toISOString();
    this.writeManifest(manifest);
  }

  // ─── Helpers ───

  private writeManifest(manifest: JobManifest): void {
    const path = join(this.getJobDir(manifest.jobId), 'manifest.json');
    writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  private getNextStage(stage: Stage): Stage | null {
    const order: Stage[] = ['format', 'structurize', 'validate', 'merge', 'index'];
    const idx = order.indexOf(stage);
    return idx < order.length - 1 ? order[idx + 1] : null;
  }
}
