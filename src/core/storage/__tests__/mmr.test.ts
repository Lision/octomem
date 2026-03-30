/**
 * Tests for MMR (Maximal Marginal Relevance) re-ranking.
 */

import { describe, it, expect } from 'vitest';
import { mmrRerank, tokenize, jaccardSimilarity } from '../mmr.js';
import type { MMRItem } from '../mmr.js';

describe('tokenize', () => {
  it('should tokenize lowercase text', () => {
    const tokens = tokenize('hello world test');
    expect(tokens).toEqual(new Set(['hello', 'world', 'test']));
  });

  it('should ignore uppercase', () => {
    const tokens = tokenize('Hello WORLD');
    expect(tokens).toEqual(new Set(['hello', 'world']));
  });

  it('should handle empty string', () => {
    const tokens = tokenize('');
    expect(tokens).toEqual(new Set());
  });
});

describe('jaccardSimilarity', () => {
  it('should return 1 for identical sets', () => {
    const set = new Set(['a', 'b', 'c']);
    expect(jaccardSimilarity(set, set)).toBe(1);
  });

  it('should return 0 for disjoint sets', () => {
    const a = new Set(['a', 'b']);
    const b = new Set(['c', 'd']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('should compute partial overlap', () => {
    const a = new Set(['a', 'b', 'c']);
    const b = new Set(['b', 'c', 'd']);
    // intersection: {b, c} = 2, union: {a, b, c, d} = 4 → 2/4 = 0.5
    expect(jaccardSimilarity(a, b)).toBe(0.5);
  });

  it('should handle empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
    expect(jaccardSimilarity(new Set(['a']), new Set())).toBe(0);
  });
});

describe('mmrRerank', () => {
  const makeItem = (id: string, score: number, content: string): MMRItem => ({
    id,
    score,
    content,
  });

  it('should return items unchanged when disabled', () => {
    const items = [
      makeItem('1', 0.9, 'first item'),
      makeItem('2', 0.8, 'second item'),
    ];
    const result = mmrRerank(items, { enabled: false });
    expect(result.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('should return items unchanged for single item', () => {
    const items = [makeItem('1', 0.9, 'only item')];
    const result = mmrRerank(items, { enabled: true });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('1');
  });

  it('should return all items', () => {
    const items = [
      makeItem('1', 0.9, 'first item about cats'),
      makeItem('2', 0.8, 'second item about dogs'),
      makeItem('3', 0.7, 'third item about fish'),
    ];
    const result = mmrRerank(items, { enabled: true, lambda: 0.7 });
    expect(result).toHaveLength(3);
    expect(new Set(result.map((i) => i.id))).toEqual(new Set(['1', '2', '3']));
  });

  it('should sort by score when lambda=1', () => {
    const items = [
      makeItem('1', 0.5, 'low score'),
      makeItem('2', 0.9, 'high score'),
      makeItem('3', 0.7, 'medium score'),
    ];
    const result = mmrRerank(items, { enabled: true, lambda: 1 });
    expect(result.map((i) => i.score)).toEqual([0.9, 0.7, 0.5]);
  });

  it('should promote diversity with low lambda', () => {
    const items = [
      makeItem('1', 1.0, 'agent architecture design pattern'),
      makeItem('2', 0.95, 'agent architecture design pattern similar'),
      makeItem('3', 0.8, 'database storage indexing strategy'),
    ];

    const result = mmrRerank(items, { enabled: true, lambda: 0.3 });
    // With low lambda (diversity-focused), item 3 should be ranked higher
    // because it's less similar to item 1
    const pos3 = result.findIndex((i) => i.id === '3');
    // Item 3 should not be last (diversity pushes it up)
    expect(pos3).toBeLessThan(result.length - 1);
  });

  it('should not modify original array', () => {
    const items = [
      makeItem('1', 0.9, 'first'),
      makeItem('2', 0.8, 'second'),
    ];
    const original = [...items];
    mmrRerank(items, { enabled: true, lambda: 0.7 });
    expect(items.map((i) => i.id)).toEqual(original.map((i) => i.id));
  });
});
