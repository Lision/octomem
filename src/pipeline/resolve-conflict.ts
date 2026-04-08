/**
 * resolveConflict() — resolve memory conflicts.
 *
 * MVP: user manually decides which memory to keep.
 * Future: LLM-assisted resolution with pre-training + web search.
 */

import type { MemoryStore } from '../core/storage/store.js';
import type { ResolveConflictInput, ResolveConflictOutput } from './types.js';
import type { Conflict } from '../core/storage/types.js';

/** Resolve a conflict manually (MVP: user picks winner) */
export async function resolveConflict(
  input: ResolveConflictInput,
  store: MemoryStore,
): Promise<ResolveConflictOutput> {
  let conflict: Conflict | null = null;

  if (input.conflictId) {
    // Find conflict by ID
    const pending = await store.getPendingConflicts();
    conflict = pending.find((c) => c.id === input.conflictId) ?? null;
  } else if (input.memoryIds && input.memoryIds.length >= 2) {
    // Find conflict by memory IDs
    const pending = await store.getPendingConflicts();
    conflict = pending.find((c) =>
      input.memoryIds!.every((id) => c.memoryIds.includes(id)),
    ) ?? null;
  }

  if (!conflict) {
    throw new Error('Conflict not found. Provide a valid conflictId or memoryIds.');
  }

  // For MVP: use hint to determine winner, or pick the first memory
  const winnerId = input.hint
    ? conflict.memoryIds.find((id) => input.hint!.includes(id)) ?? conflict.memoryIds[0]
    : conflict.memoryIds[0];

  const resolution = input.hint ?? `Manually resolved: keeping memory ${winnerId}`;

  await store.resolveConflict(conflict.id, winnerId, resolution, 'manual');

  return {
    winnerId,
    resolution,
    confidence: 0.8,
  };
}
