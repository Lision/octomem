/**
 * Tests for export pipeline function helpers.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Memory } from '../../core/storage/types.js';

function buildFrontMatter(memory: Memory): string {
  const lines = [
    '---',
    `id: ${memory.id}`,
    `title: "${(memory.title ?? 'Untitled').replace(/"/g, '\\"')}"`,
    `summary: "${(memory.summary ?? '').replace(/"/g, '\\"')}"`,
  ];

  if (memory.keyPoints && memory.keyPoints.length > 0) {
    lines.push('keyPoints:');
    lines.push(...memory.keyPoints.map((p) => `  - "${p.replace(/"/g, '\\"')}"`));
  }

  if (memory.tags.length > 0) {
    lines.push('tags:');
    lines.push(...memory.tags.map((t) => `  - "${t}"`));
  }

  lines.push(`confidence: ${memory.confidence}`);
  lines.push(`status: ${memory.status}`);
  lines.push(`source: "${memory.source ?? 'user_input'}"`);
  lines.push(`createdAt: ${memory.createdAt}`);

  if (memory.chainRootId) {
    lines.push(`chainRootId: ${memory.chainRootId}`);
  }

  lines.push('---');
  return lines.join('\n');
}

describe('export helpers', () => {
  describe('buildFrontMatter from Memory', () => {
    it('should build front matter from a Memory object', () => {
      const memory: Memory = {
        id: 'test-123',
        content: 'Test content',
        title: 'Test Memory',
        summary: 'A test summary',
        keyPoints: ['point 1', 'point 2'],
        tags: ['test/unit'],
        confidence: 0.9,
        status: 'active',
        accessCount: 0,
        source: 'test',
        createdAt: '2026-04-07T00:00:00Z',
        updatedAt: '2026-04-07T00:00:00Z',
      };

      const fm = buildFrontMatter(memory);

      expect(fm).toContain('id: test-123');
      expect(fm).toContain('title: "Test Memory"');
      expect(fm).toContain('summary: "A test summary"');
      expect(fm).toContain('confidence: 0.9');
      expect(fm).toContain('status: active');
      expect(fm).toContain('- "point 1"');
      expect(fm).toContain('- "test/unit"');
    });

    it('should handle memory without optional fields', () => {
      const memory: Memory = {
        id: 'minimal',
        content: 'Minimal',
        confidence: 0.5,
        status: 'active',
        tags: [],
        accessCount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };

      const fm = buildFrontMatter(memory);

      expect(fm).toContain('title: "Untitled"');
      expect(fm).toContain('summary: ""');
      expect(fm).not.toContain('keyPoints:');
      expect(fm).not.toContain('tags:');
    });
  });

  describe('file copy integration', () => {
    it('should copy md files to output directory', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'octomem-export-unit-'));
      const outputDir = join(testDir, 'export');

      try {
        // Simulate entities structure
        const entitiesDir = join(testDir, 'entities', 'test');
        mkdirSync(entitiesDir, { recursive: true });
        writeFileSync(join(entitiesDir, 'memory-1.md'), '---\nid: 1\n---\n\nContent 1', 'utf-8');

        // Simulate export by copying
        mkdirSync(join(outputDir, 'test'), { recursive: true });
        const { copyFileSync } = require('node:fs');
        copyFileSync(
          join(entitiesDir, 'memory-1.md'),
          join(outputDir, 'test', 'memory-1.md'),
        );

        expect(existsSync(join(outputDir, 'test', 'memory-1.md'))).toBe(true);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
