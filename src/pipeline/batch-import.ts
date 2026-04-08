/**
 * batchImport() — import multiple files with parallel format/structurize + serial validate/merge/index.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Model } from '@mariozechner/pi-ai';
import type { MemoryStore } from '../core/storage/store.js';
import { addMemory } from './add-memory.js';
import type { BatchImportInput, BatchImportOutput, AddMemoryInput } from './types.js';

/** Collect files matching a glob-like pattern */
function collectFiles(dir: string, pattern?: string): string[] {
  const files: string[] = [];
  const regex = pattern ? new RegExp(pattern) : /\.(md|txt|json)$/;

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (regex.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/** Batch import files as memories */
export async function batchImport(
  input: BatchImportInput,
  store: MemoryStore,
  model: Model<'openai-completions'>,
  rootDir: string,
): Promise<BatchImportOutput> {
  let files = input.files;

  // If files list is empty but pattern is given, scan directories
  if (files.length === 1) {
    const stat = statSync(files[0]);
    if (stat.isDirectory()) {
      files = collectFiles(files[0], input.pattern);
    }
  }

  const result: BatchImportOutput = {
    total: files.length,
    succeeded: 0,
    failed: 0,
    merged: 0,
    conflicted: 0,
    errors: [],
  };

  const concurrency = input.concurrency ?? 1;

  // Process in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const promises = batch.map(async (file) => {
      try {
        const content = readFileSync(file, 'utf-8');
        const addInput: AddMemoryInput = {
          content,
          source: file,
          skipValidation: input.skipValidation,
          autoMerge: input.autoMerge,
        };

        const output = await addMemory(addInput, store, model, rootDir);

        if (output.merged) result.merged++;
        if (output.conflicted) result.conflicted++;
        result.succeeded++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          file,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    await Promise.all(promises);
  }

  return result;
}
