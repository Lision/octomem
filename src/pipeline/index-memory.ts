/**
 * indexMemory() — dual-write: md file to entities/ + SQLite index.
 *
 * Writes a YAML-front-matter markdown file to memory/entities/{primaryTag}/
 * and indexes the content in SQLite via MemoryStore.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { MemoryStore } from '../core/storage/store.js';
import type { IndexInput, IndexOutput } from './types.js';

/** Build YAML front matter for a memory md file */
function buildFrontMatter(input: IndexInput, id: string, createdAt: string): string {
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

/** Get the primary tag for directory organization */
function getPrimaryTag(tags: string[]): string {
  if (tags.length === 0) return 'untagged';
  // Use the first tag's top-level category
  const tag = tags[0];
  return tag.split('/')[0];
}

/** Sanitize a string for use as a filename */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** Index a memory: write md file + SQLite index */
export async function indexMemory(
  input: IndexInput,
  store: MemoryStore,
  rootDir: string,
): Promise<IndexOutput> {
  // Add to SQLite via store
  const memory = await store.addMemory({
    content: input.content,
    title: input.title,
    summary: input.summary,
    keyPoints: input.keyPoints,
    tags: input.tags,
    confidence: input.confidence,
    source: input.source,
    chainRootId: input.chainRootId,
  });

  // Determine file path
  const primaryTag = getPrimaryTag(input.tags);
  const entitiesDir = join(rootDir, 'entities', primaryTag);

  if (!existsSync(entitiesDir)) {
    mkdirSync(entitiesDir, { recursive: true });
  }

  const filename = `${sanitizeFilename(input.title)}-${memory.id}.md`;
  const filePath = join(entitiesDir, filename);

  // Write md file with YAML front matter
  const frontMatter = buildFrontMatter(input, memory.id, memory.createdAt);
  const fullContent = `${frontMatter}\n\n${input.content}`;

  writeFileSync(filePath, fullContent, 'utf-8');

  // Count segments (approximation based on store behavior)
  const segmentCount = input.content.split('\n\n').filter(Boolean).length;

  return { memory, filePath, segmentCount };
}
