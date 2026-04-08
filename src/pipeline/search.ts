/**
 * search() — enriched search over memories.
 *
 * Wraps MemoryStore.search() with full Memory objects attached to results.
 */

import { MemoryStore } from '../core/storage/store.js';
import type { SearchInput, EnrichedSearchResult } from './types.js';

/** Search memories with enriched results */
export async function search(
  input: SearchInput,
  store: MemoryStore,
): Promise<EnrichedSearchResult[]> {
  const results = await store.search(input.query, {
    maxResults: input.maxResults ?? 10,
  } as any);

  const enriched: EnrichedSearchResult[] = [];

  for (const result of results) {
    const memory = await store.getMemory(result.memoryId);
    if (!memory) continue;

    // Filter by tags if specified
    if (input.filterTags && input.filterTags.length > 0) {
      const hasTag = input.filterTags.some((ft) =>
        memory.tags.some((mt) => mt === ft || mt.startsWith(ft + '/')),
      );
      if (!hasTag) continue;
    }

    enriched.push({
      id: result.id,
      memoryId: result.memoryId,
      memory,
      score: result.score,
      snippet: result.snippet,
    });
  }

  return enriched;
}
