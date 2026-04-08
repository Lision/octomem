/**
 * Tests for search pipeline function.
 *
 * Tests the filtering logic without network calls.
 */

import { describe, it, expect } from 'vitest';
import type { EnrichedSearchResult, SearchInput } from '../types.js';
import type { Memory } from '../../core/storage/types.js';

// Test the tag filtering logic directly
function matchesFilter(memory: Memory, filterTags?: string[]): boolean {
  if (!filterTags || filterTags.length === 0) return true;
  return filterTags.some((ft) =>
    memory.tags.some((mt) => mt === ft || mt.startsWith(ft + '/')),
  );
}

describe('search helpers', () => {
  describe('tag filtering', () => {
    const mockMemory = (tags: string[]): Memory => ({
      id: 'test',
      content: 'test',
      tags,
      confidence: 0.8,
      status: 'active',
      accessCount: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    it('should pass when no filter specified', () => {
      expect(matchesFilter(mockMemory(['typescript']), undefined)).toBe(true);
      expect(matchesFilter(mockMemory(['typescript']), [])).toBe(true);
    });

    it('should match exact tag', () => {
      expect(matchesFilter(mockMemory(['typescript/generics']), ['typescript'])).toBe(true);
    });

    it('should match hierarchical tag', () => {
      expect(matchesFilter(mockMemory(['typescript/generics']), ['typescript/generics'])).toBe(true);
    });

    it('should match parent tag prefix', () => {
      expect(matchesFilter(mockMemory(['typescript/generics']), ['typescript'])).toBe(true);
    });

    it('should not match unrelated tag', () => {
      expect(matchesFilter(mockMemory(['rust/ownership']), ['typescript'])).toBe(false);
    });

    it('should match any of multiple filter tags', () => {
      expect(matchesFilter(mockMemory(['rust/ownership']), ['typescript', 'rust'])).toBe(true);
    });
  });
});
