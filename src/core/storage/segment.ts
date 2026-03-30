/**
 * Text segmentation for Octomem.
 *
 * Splits markdown content into searchable segments (~400 tokens, 80 token overlap).
 * Based on OpenClaw's chunkMarkdown() algorithm but simplified for Octomem's needs.
 *
 * Segments reference line numbers in memories.content, not file paths.
 * Segments can always be regenerated from content.
 */

import { hashText } from './utils.js';
import type { Segment } from './types.js';

/** Segmentation configuration */
export interface SegmentConfig {
  /** Approximate tokens per segment (default: 400) */
  tokens: number;
  /** Overlap in tokens between adjacent segments (default: 80) */
  overlap: number;
}

export const DEFAULT_SEGMENT_CONFIG: SegmentConfig = {
  tokens: 400,
  overlap: 80,
};

/**
 * Segment markdown content into searchable chunks.
 *
 * Each segment records start_line and end_line (1-indexed) relative to
 * the original content. The text field contains the actual lines.
 */
export function segmentMarkdown(
  content: string,
  config: SegmentConfig = DEFAULT_SEGMENT_CONFIG,
): Omit<Segment, 'id' | 'memoryId' | 'embedding' | 'createdAt'>[] {
  const lines = content.split('\n');
  if (lines.length === 0) {
    return [];
  }

  const maxChars = Math.max(32, config.tokens * 4);
  const overlapChars = Math.max(0, config.overlap * 4);
  const segments: Omit<Segment, 'id' | 'memoryId' | 'embedding' | 'createdAt'>[] = [];

  let current: Array<{ line: string; lineNo: number }> = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length === 0) return;
    const firstEntry = current[0]!;
    const lastEntry = current[current.length - 1]!;
    const text = current.map((entry) => entry.line).join('\n');
    segments.push({
      startLine: firstEntry.lineNo,
      endLine: lastEntry.lineNo,
      text,
      hash: hashText(text),
    });
  };

  const carryOverlap = () => {
    if (overlapChars <= 0 || current.length === 0) {
      current = [];
      currentChars = 0;
      return;
    }
    let acc = 0;
    const kept: Array<{ line: string; lineNo: number }> = [];
    for (let i = current.length - 1; i >= 0; i--) {
      const entry = current[i]!;
      acc += entry.line.length + 1;
      kept.unshift(entry);
      if (acc >= overlapChars) break;
    }
    current = kept;
    currentChars = kept.reduce((sum, entry) => sum + entry.line.length + 1, 0);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNo = i + 1;
    const segments_per_line: string[] = [];

    if (line.length === 0) {
      segments_per_line.push('');
    } else {
      for (let start = 0; start < line.length; start += maxChars) {
        segments_per_line.push(line.slice(start, start + maxChars));
      }
    }

    for (const segment of segments_per_line) {
      const lineSize = segment.length + 1;
      if (currentChars + lineSize > maxChars && current.length > 0) {
        flush();
        carryOverlap();
      }
      current.push({ line: segment, lineNo });
      currentChars += lineSize;
    }
  }

  flush();
  return segments;
}
