/**
 * export() — export memories as standalone md files.
 *
 * Copies md files from entities/ to the output directory,
 * organized by tag structure. Already-existing md files in entities/
 * are copied directly; memories without md files are generated.
 */

import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import type { MemoryStore } from '../core/storage/store.js';
import type { ExportInput, ExportOutput } from './types.js';
import type { Memory } from '../core/storage/types.js';

/** Build YAML front matter for a memory */
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

  lines.push(`confidence: ${Math.round(memory.confidence * 100) / 100}`);
  lines.push(`status: ${memory.status}`);
  lines.push(`source: "${memory.source ?? 'user_input'}"`);
  lines.push(`createdAt: ${memory.createdAt}`);

  if (memory.chainRootId) {
    lines.push(`chainRootId: ${memory.chainRootId}`);
  }

  lines.push('---');
  return lines.join('\n');
}

/** Export memories to md files */
export async function exportMemories(
  input: ExportInput,
  store: MemoryStore,
  rootDir: string,
): Promise<ExportOutput> {
  const activeOnly = input.activeOnly ?? true;
  const entitiesDir = join(rootDir, 'entities');
  let fileCount = 0;
  let skipped = 0;

  // Ensure output directory exists
  mkdirSync(input.outputDir, { recursive: true });

  // If no tag filter, copy/refresh all entities
  if (!input.filterTags || input.filterTags.length === 0) {
    // Direct copy from entities/ if it exists
    if (existsSync(entitiesDir)) {
      const dirs = readdirSync(entitiesDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const srcDir = join(entitiesDir, dir.name);
        const destDir = join(input.outputDir, dir.name);
        mkdirSync(destDir, { recursive: true });

        const files = readdirSync(srcDir).filter((f) => f.endsWith('.md'));
        for (const file of files) {
          copyFileSync(join(srcDir, file), join(destDir, file));
          fileCount++;
        }
      }
    }
    return { fileCount, outputDir: input.outputDir, skipped };
  }

  // Tag-filtered export: query store for matching memories
  for (const tag of input.filterTags) {
    const tags = await store.getTagsByPrefix(tag);

    for (const t of tags) {
      // Get memories with this tag — we search by tag
      const results = await store.search(t.name, {
        maxResults: 100,
      } as any);

      for (const result of results) {
        const memory = await store.getMemory(result.memoryId);
        if (!memory) { skipped++; continue; }
        if (activeOnly && memory.status !== 'active') { skipped++; continue; }
        if (!memory.tags.some((mt) => mt === tag || mt.startsWith(tag + '/'))) {
          skipped++;
          continue;
        }

        // Write md file
        const tagDir = join(input.outputDir, tag.replace(/\//g, '-'));
        mkdirSync(tagDir, { recursive: true });

        const filename = `${memory.id}.md`;
        const frontMatter = buildFrontMatter(memory);
        writeFileSync(join(tagDir, filename), `${frontMatter}\n\n${memory.content}`, 'utf-8');
        fileCount++;
      }
    }
  }

  return { fileCount, outputDir: input.outputDir, skipped };
}
