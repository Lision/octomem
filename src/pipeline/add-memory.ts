/**
 * addMemory() — orchestrates the full pipeline: format → structurize → validate → merge → index.
 *
 * Handles staging persistence for interruption recovery.
 */

import type { Model } from '@mariozechner/pi-ai';
import type { MemoryStore } from '../core/storage/store.js';
import { StagingManager } from '../core/staging/staging.js';
import { format } from './format.js';
import { structurize } from './structurize.js';
import { validate } from './validate.js';
import { merge } from './merge.js';
import { indexMemory } from './index-memory.js';
import type { AddMemoryInput, AddMemoryOutput } from './types.js';
import type { Stage } from '../core/staging/types.js';
import type { Memory } from '../core/storage/types.js';

/** Orchestrate the full add-memory pipeline */
export async function addMemory(
  input: AddMemoryInput,
  store: MemoryStore,
  model: Model<'openai-completions'>,
  rootDir: string,
): Promise<AddMemoryOutput> {
  const staging = new StagingManager(rootDir);
  const manifest = staging.createJob(input.source);
  const stages: string[] = [];
  let merged = false;
  let conflicted = false;

  try {
    // ─── Stage 1: Format ───
    let formattedContent: string;

    if (input.skipFormat) {
      formattedContent = input.content;
      staging.updateStage(manifest, 'format', 'skipped');
    } else {
      const formatted = await format({ content: input.content, source: input.source }, model);
      formattedContent = formatted.content;
      staging.writeStageOutput(manifest.jobId, 'format', formattedContent);
      staging.updateStage(manifest, 'format', 'completed');
      stages.push('format');
    }

    // ─── Stage 2: Structurize ───
    const structured = await structurize(
      {
        content: formattedContent,
        source: input.source,
        hints: { title: input.title, tags: input.tags },
      },
      model,
    );
    staging.writeStageOutput(manifest.jobId, 'structurize', JSON.stringify(structured));
    staging.updateStage(manifest, 'structurize', 'completed');
    stages.push('structurize');

    // ─── Stage 3: Validate ───
    let finalContent = formattedContent;
    let finalTitle = structured.title;
    let finalSummary = structured.summary;
    let finalKeyPoints = structured.keyPoints;
    let finalConfidence = 0.8;
    let supersededIds: string[] = [];

    if (input.skipValidation) {
      staging.updateStage(manifest, 'validate', 'skipped');
    } else {
      const validated = await validate(
        {
          content: formattedContent,
          summary: structured.summary,
          keyPoints: structured.keyPoints,
          tags: structured.tags,
        },
        store,
        model,
      );
      staging.writeStageOutput(manifest.jobId, 'validate', JSON.stringify(validated));
      staging.updateStage(manifest, 'validate', 'completed');
      stages.push('validate');

      finalConfidence = validated.confidence;

      // Handle contradictions → create conflict
      if (validated.contradictions.length > 0) {
        const conflictMemoryIds = validated.contradictions.map((c) => c.existingMemoryId);
        // We don't have the new memory ID yet, so create conflict after indexing
        conflicted = true;
      }

      // Handle overlaps → merge
      if (validated.overlaps.length > 0 && input.autoMerge) {
        const overlappingMemories = await Promise.all(
          validated.overlaps.map((o) => store.getMemory(o.existingMemoryId)),
        );
        const validMemories = overlappingMemories.filter((m): m is Memory => m !== null);

        if (validMemories.length > 0) {
          const mergedResult = await merge(
            { memories: validMemories, newContent: formattedContent, strategy: 'auto' },
            model,
          );

          if (mergedResult.action === 'merged' && mergedResult.mergedMemory) {
            finalContent = mergedResult.mergedMemory.content;
            finalTitle = mergedResult.mergedMemory.title;
            finalSummary = mergedResult.mergedMemory.summary;
            finalKeyPoints = mergedResult.mergedMemory.keyPoints;
            finalConfidence = mergedResult.mergedMemory.confidence;
            supersededIds = mergedResult.supersededIds;
            merged = true;

            staging.writeStageOutput(manifest.jobId, 'merge', JSON.stringify(mergedResult));
            staging.updateStage(manifest, 'merge', 'completed');
            stages.push('merge');
          }
        }
      }

      if (!merged) {
        staging.updateStage(manifest, 'merge', 'skipped');
      }
    }

    // ─── Stage 4: Resolve tags ───
    const resolvedTags = await store.resolveTags(structured.tags);

    // ─── Stage 5: Index ───
    const indexed = await indexMemory(
      {
        content: finalContent,
        title: finalTitle,
        summary: finalSummary,
        keyPoints: finalKeyPoints,
        tags: resolvedTags,
        confidence: finalConfidence,
        source: input.source,
        chainRootId: input.chainRootId,
      },
      store,
      rootDir,
    );

    staging.writeStageOutput(manifest.jobId, 'index', JSON.stringify({ memoryId: indexed.memory.id }));
    staging.updateStage(manifest, 'index', 'completed');
    stages.push('index');

    // Mark superseded memories
    for (const id of supersededIds) {
      await store.updateMemory(id, { status: 'superseded' });
    }

    // Create conflict if needed — one conflict for all contradictions
    if (conflicted) {
      const validated = JSON.parse(staging.readStageOutput(manifest.jobId, 'validate')!);
      const existingIds = validated.contradictions.map((c: any) => c.existingMemoryId);
      const reasons = validated.contradictions.flatMap((c: any) => c.conflictingPoints ?? []);
      await store.createConflict(
        indexed.memory.id,
        existingIds,
        reasons.join('; '),
      );
    }

    // Cleanup staging
    staging.completeJob(manifest);
    staging.cleanupJob(manifest.jobId);

    return {
      memory: indexed.memory,
      filePath: indexed.filePath,
      stages,
      merged,
      conflicted,
    };
  } catch (error) {
    // Leave staging for resume
    throw error;
  }
}
