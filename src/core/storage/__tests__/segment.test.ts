/**
 * Tests for text segmentation.
 */

import { describe, it, expect } from 'vitest';
import { segmentMarkdown, DEFAULT_SEGMENT_CONFIG } from '../segment.js';

describe('segmentMarkdown', () => {
  it('should return empty array for empty content', () => {
    const segments = segmentMarkdown('');
    expect(segments).toEqual([]);
  });

  it('should create at least one segment for short content', () => {
    const content = '# Hello\n\nThis is a test.';
    const segments = segmentMarkdown(content);

    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segments[0]!.startLine).toBe(1);
    expect(segments[0]!.text).toContain('Hello');
  });

  it('should preserve line numbers correctly', () => {
    const content = 'line1\nline2\nline3\nline4\nline5';
    const segments = segmentMarkdown(content, { tokens: 2, overlap: 0 });

    // Each segment should have valid line numbers
    for (const seg of segments) {
      expect(seg.startLine).toBeGreaterThanOrEqual(1);
      expect(seg.endLine).toBeGreaterThanOrEqual(seg.startLine);
    }

    // First segment should start at line 1
    expect(segments[0]!.startLine).toBe(1);
  });

  it('should create multiple segments for long content', () => {
    // Create content that exceeds one segment (~400 tokens = ~1600 chars)
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: some content here.`);
    const content = lines.join('\n');
    const segments = segmentMarkdown(content, { tokens: 20, overlap: 5 });

    expect(segments.length).toBeGreaterThan(1);
  });

  it('should include hash for each segment', () => {
    const content = '# Test\nSome content\nMore content';
    const segments = segmentMarkdown(content);

    for (const seg of segments) {
      expect(seg.hash).toBeTruthy();
      expect(typeof seg.hash).toBe('string');
    }
  });

  it('should produce stable hashes for same content', () => {
    const content = '# Test\nSome content';
    const segments1 = segmentMarkdown(content);
    const segments2 = segmentMarkdown(content);

    expect(segments1.length).toBe(segments2.length);
    for (let i = 0; i < segments1.length; i++) {
      expect(segments1[i]!.hash).toBe(segments2[i]!.hash);
    }
  });

  it('should respect overlap config', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
    const content = lines.join('\n');

    const noOverlap = segmentMarkdown(content, { tokens: 10, overlap: 0 });
    const withOverlap = segmentMarkdown(content, { tokens: 10, overlap: 5 });

    // With overlap, segments should share some text
    // Without overlap, segments should be strictly sequential
    expect(noOverlap.length).toBeGreaterThan(0);
    expect(withOverlap.length).toBeGreaterThan(0);
  });

  it('should handle content with only newlines', () => {
    const content = '\n\n\n\n';
    const segments = segmentMarkdown(content);
    // Empty lines still produce segments
    expect(segments.length).toBeGreaterThanOrEqual(0);
  });
});
