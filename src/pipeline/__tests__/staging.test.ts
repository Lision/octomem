/**
 * Tests for StagingManager.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StagingManager } from '../../core/staging/staging.js';

let testDir: string;
let staging: StagingManager;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'octomem-staging-test-'));
  staging = new StagingManager(testDir);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('StagingManager', () => {
  it('should create a job with correct initial manifest', () => {
    const manifest = staging.createJob('test.md');

    expect(manifest.jobId).toBeTruthy();
    expect(manifest.source).toBe('test.md');
    expect(manifest.currentStage).toBe('format');
    expect(manifest.stages.format).toBe('pending');
    expect(manifest.stages.structurize).toBe('pending');
    expect(manifest.stages.validate).toBe('pending');
    expect(manifest.stages.merge).toBe('pending');
    expect(manifest.stages.index).toBe('pending');
    expect(manifest.completedAt).toBeUndefined();
  });

  it('should persist and read manifest', () => {
    const manifest = staging.createJob('test.md');
    const read = staging.getManifest(manifest.jobId);

    expect(read).not.toBeNull();
    expect(read!.jobId).toBe(manifest.jobId);
    expect(read!.source).toBe('test.md');
  });

  it('should update stage status and advance', () => {
    const manifest = staging.createJob();
    const updated = staging.updateStage(manifest, 'format', 'completed');

    expect(updated.stages.format).toBe('completed');
    expect(updated.currentStage).toBe('structurize');
  });

  it('should advance through all stages', () => {
    let manifest = staging.createJob();

    manifest = staging.updateStage(manifest, 'format', 'completed');
    expect(manifest.currentStage).toBe('structurize');

    manifest = staging.updateStage(manifest, 'structurize', 'completed');
    expect(manifest.currentStage).toBe('validate');

    manifest = staging.updateStage(manifest, 'validate', 'completed');
    expect(manifest.currentStage).toBe('merge');

    manifest = staging.updateStage(manifest, 'merge', 'completed');
    expect(manifest.currentStage).toBe('index');
  });

  it('should stay on last stage after index completes', () => {
    let manifest = staging.createJob();
    manifest = staging.updateStage(manifest, 'format', 'completed');
    manifest = staging.updateStage(manifest, 'structurize', 'completed');
    manifest = staging.updateStage(manifest, 'validate', 'completed');
    manifest = staging.updateStage(manifest, 'merge', 'completed');
    manifest = staging.updateStage(manifest, 'index', 'completed');

    expect(manifest.currentStage).toBe('index');
  });

  it('should skip stages', () => {
    const manifest = staging.createJob();
    const updated = staging.updateStage(manifest, 'format', 'skipped');

    expect(updated.stages.format).toBe('skipped');
    // currentStage stays the same for 'skipped'
    expect(updated.currentStage).toBe('format');
  });

  it('should write and read stage output', () => {
    const manifest = staging.createJob();
    const data = '# Formatted Content\n\nHello world';

    staging.writeStageOutput(manifest.jobId, 'format', data);
    const output = staging.readStageOutput(manifest.jobId, 'format');

    expect(output).toBe(data);
  });

  it('should return null for non-existent stage output', () => {
    const manifest = staging.createJob();
    const output = staging.readStageOutput(manifest.jobId, 'structurize');

    expect(output).toBeNull();
  });

  it('should clean up job directory', () => {
    const manifest = staging.createJob();
    staging.writeStageOutput(manifest.jobId, 'format', 'test');

    staging.cleanupJob(manifest.jobId);

    const read = staging.getManifest(manifest.jobId);
    expect(read).toBeNull();
  });

  it('should mark job as completed', () => {
    const manifest = staging.createJob();
    staging.completeJob(manifest);

    const read = staging.getManifest(manifest.jobId);
    expect(read!.completedAt).toBeTruthy();
  });

  it('should find incomplete jobs', () => {
    const m1 = staging.createJob('file1.md');
    const m2 = staging.createJob('file2.md');
    staging.completeJob(m1);

    const incomplete = staging.getIncompleteJobs();

    expect(incomplete.length).toBe(1);
    expect(incomplete[0].jobId).toBe(m2.jobId);
  });

  it('should return empty array when no staging dir exists', () => {
    const emptyStaging = new StagingManager(join(tmpdir(), 'nonexistent'));
    const jobs = emptyStaging.getIncompleteJobs();
    expect(jobs).toEqual([]);
  });
});
