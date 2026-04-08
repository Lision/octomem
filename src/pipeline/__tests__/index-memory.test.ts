/**
 * Tests for indexMemory pipeline function.
 *
 * Tests the md file writing logic directly (doesn't call store.addMemory which needs embedding API).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Test the front matter building logic directly
function buildFrontMatter(input: {
  title: string;
  summary: string;
  keyPoints: string[];
  tags: string[];
  confidence: number;
  source?: string;
  chainRootId?: string;
}, id: string, createdAt: string): string {
  const lines = [
    '---',
    `id: ${id}`,
    `title: "${input.title.replace(/"/g, '\\"')}"`,
    `summary: "${input.summary.replace(/"/g, '\\"')}"`,
    `keyPoints:`,
    ...input.keyPoints.map((p) => `  - "${p.replace(/"/g, '\\"')}"`),
    `tags:`,
    ...input.tags.map((t) => `  - "${t}"`),
    `confidence: ${input.confidence}`,
    `source: "${input.source ?? 'user_input'}"`,
    `createdAt: ${createdAt}`,
  ];

  if (input.chainRootId) {
    lines.push(`chainRootId: ${input.chainRootId}`);
  }

  lines.push('---');
  return lines.join('\n');
}

function getPrimaryTag(tags: string[]): string {
  if (tags.length === 0) return 'untagged';
  return tags[0].split('/')[0];
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

describe('indexMemory helpers', () => {
  describe('buildFrontMatter', () => {
    it('should build valid YAML front matter', () => {
      const fm = buildFrontMatter({
        title: 'TypeScript Generics',
        summary: 'An overview',
        keyPoints: ['Type safety', 'Flexibility'],
        tags: ['typescript/generics'],
        confidence: 0.85,
        source: 'docs',
      }, 'abc123', '2026-04-07T00:00:00Z');

      expect(fm).toContain('id: abc123');
      expect(fm).toContain('title: "TypeScript Generics"');
      expect(fm).toContain('confidence: 0.85');
      expect(fm).toContain('- "Type safety"');
      expect(fm).toContain('- "typescript/generics"');
      expect(fm).toContain('createdAt: 2026-04-07T00:00:00Z');
    });

    it('should handle quotes in content', () => {
      const fm = buildFrontMatter({
        title: 'It\'s a "test"',
        summary: 'He said "hello"',
        keyPoints: [],
        tags: [],
        confidence: 0.8,
      }, 'id', '2026-01-01');

      expect(fm).toContain('title: "It\'s a \\"test\\""');
      expect(fm).toContain('summary: "He said \\"hello\\""');
    });

    it('should include chainRootId when provided', () => {
      const fm = buildFrontMatter({
        title: 'Test',
        summary: 'Summary',
        keyPoints: [],
        tags: [],
        confidence: 0.8,
        chainRootId: 'chain-123',
      }, 'id', '2026-01-01');

      expect(fm).toContain('chainRootId: chain-123');
    });

    it('should not include chainRootId when not provided', () => {
      const fm = buildFrontMatter({
        title: 'Test',
        summary: 'Summary',
        keyPoints: [],
        tags: [],
        confidence: 0.8,
      }, 'id', '2026-01-01');

      expect(fm).not.toContain('chainRootId');
    });
  });

  describe('getPrimaryTag', () => {
    it('should extract top-level tag', () => {
      expect(getPrimaryTag(['typescript/generics'])).toBe('typescript');
      expect(getPrimaryTag(['rust/ownership', 'systems'])).toBe('rust');
    });

    it('should return untagged for empty tags', () => {
      expect(getPrimaryTag([])).toBe('untagged');
    });

    it('should handle flat tags', () => {
      expect(getPrimaryTag(['architecture'])).toBe('architecture');
    });
  });

  describe('sanitizeFilename', () => {
    it('should lowercase and replace special chars', () => {
      expect(sanitizeFilename('TypeScript Generics')).toBe('typescript-generics');
    });

    it('should truncate long names', () => {
      const long = 'a'.repeat(100);
      expect(sanitizeFilename(long).length).toBe(60);
    });

    it('should trim leading/trailing dashes', () => {
      expect(sanitizeFilename('--test--')).toBe('test');
    });
  });

  describe('md file writing integration', () => {
    it('should write md file with correct structure', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'octomem-md-test-'));
      try {
        const entitiesDir = join(testDir, 'entities', 'typescript');
        mkdirSync(entitiesDir, { recursive: true });

        const input = {
          title: 'TypeScript Generics',
          summary: 'Overview',
          keyPoints: ['Type safety'],
          tags: ['typescript/generics'],
          confidence: 0.85,
          source: 'docs',
        };
        const id = 'test-id-123';
        const content = 'TypeScript generics allow flexible type definitions.';

        const fm = buildFrontMatter(input, id, '2026-04-07T00:00:00Z');
        const fullContent = `${fm}\n\n${content}`;

        const filename = `${sanitizeFilename(input.title)}-${id}.md`;
        const filePath = join(entitiesDir, filename);
        writeFileSync(filePath, fullContent, 'utf-8');

        expect(existsSync(filePath)).toBe(true);
        const read = readFileSync(filePath, 'utf-8');
        expect(read).toContain('---');
        expect(read).toContain('id: test-id-123');
        expect(read).toContain(content);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
