#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FormatterAgent } from './agents/formatter/index.js';
import { WorkspaceManager } from './core/workspace/index.js';
import { MemoryStore } from './core/storage/index.js';
import type { StorageConfig } from './core/storage/index.js';

const program = new Command();

program
  .name('octomem')
  .description('Octomem - Universal Agent Memory System')
  .version('0.0.1');

// ─── Helper ───

function getStoreConfig(dbPath?: string): StorageConfig {
  return {
    dbPath: dbPath ?? join(process.cwd(), 'memory', 'index.db'),
    embedding: {
      baseUrl: process.env.EMBEDDING_BASE_URL || process.env.LLM_BASE_URL,
      apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY,
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    },
  };
}

// ─── Format Command ───

program
  .command('format [file]')
  .description('Format input content to markdown')
  .option('--all', 'Process all pending files in workspace')
  .option('--stdin', 'Read from stdin')
  .action(async (file, options) => {
    const agent = new FormatterAgent();
    const workspaceManager = new WorkspaceManager();

    try {
      if (options.stdin) {
        const content = readFileSync(0, 'utf-8');
        const result = await agent.format({ content });
        console.log(result.content);
      } else if (options.all) {
        const workspace = await workspaceManager.init('formatter');
        const files = await workspaceManager.getPendingFiles(workspace);

        if (files.length === 0) {
          console.log('No pending files to process.');
          return;
        }

        console.log(`Found ${files.length} pending file(s)`);

        for (const filename of files) {
          console.log(`\nProcessing: ${filename}`);

          const content = await workspaceManager.readFile(workspace, 'pending', filename);
          await workspaceManager.moveToProcessing(workspace, filename);

          const result = await agent.format({ content });

          const mdFilename = filename.replace(/\.[^.]+$/, '.md');
          await workspaceManager.writeCompletedFile(workspace, mdFilename, result.content);

          const { unlink } = await import('fs/promises');
          await unlink(`${workspace.processing}/${filename}`);

          console.log(`Completed: ${filename} → ${mdFilename}`);
        }

        console.log(`\nAll ${files.length} file(s) processed.`);
      } else if (file) {
        const content = readFileSync(file, 'utf-8');
        const result = await agent.format({ content });
        console.log(result.content);
      } else {
        console.error('Please provide a file, use --stdin, or --all');
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Init Command ───

program
  .command('init')
  .description('Initialize memory storage database')
  .option('-d, --db <path>', 'Database file path')
  .action(async (options) => {
    try {
      const config = getStoreConfig(options.db);
      const store = new MemoryStore(config);
      await store.init();
      console.log(`Memory storage initialized: ${config.dbPath}`);
      store.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Add Command ───

program
  .command('add <file>')
  .description('Add a memory from a markdown file')
  .option('-d, --db <path>', 'Database file path')
  .option('-t, --tags <tags>', 'Comma-separated tags (e.g., architecture/agent,design)')
  .option('--title <title>', 'Memory title')
  .action(async (file, options) => {
    try {
      const content = readFileSync(file, 'utf-8');
      const config = getStoreConfig(options.db);
      const store = new MemoryStore(config);
      await store.init();

      const tags = options.tags
        ? options.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : undefined;

      const memory = await store.addMemory({
        content,
        title: options.title,
        tags,
        source: 'user_input',
      });

      console.log(`Memory added: ${memory.id}`);
      if (memory.tags.length > 0) {
        console.log(`Tags: ${memory.tags.join(', ')}`);
      }
      store.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Search Command ───

program
  .command('search <query>')
  .description('Search memories')
  .option('-d, --db <path>', 'Database file path')
  .option('-n, --limit <number>', 'Max results', '5')
  .action(async (query, options) => {
    try {
      const config = getStoreConfig(options.db);
      const store = new MemoryStore(config);
      await store.init();

      const results = await store.search(query, {
        maxResults: Number(options.limit),
      } as Partial<import('./core/storage/types.js').SearchConfig>);

      if (results.length === 0) {
        console.log('No results found.');
        store.close();
        return;
      }

      for (const result of results) {
        console.log(`\n[${result.score.toFixed(3)}] Memory: ${result.memoryId}`);
        console.log(`  Lines ${result.startLine}-${result.endLine}`);
        console.log(`  ${result.snippet}`);
      }

      store.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Chain Command ───

program
  .command('chain <id>')
  .description('View memory iteration chain by chain_root_id')
  .option('-d, --db <path>', 'Database file path')
  .action(async (id, options) => {
    try {
      const config = getStoreConfig(options.db);
      const store = new MemoryStore(config);
      await store.init();

      const chain = await store.getMemoryChain(id);

      if (chain.length === 0) {
        console.log(`No memories found for chain: ${id}`);
        store.close();
        return;
      }

      console.log(`Chain: ${id} (${chain.length} memories)\n`);
      for (const memory of chain) {
        const title = memory.title ?? 'Untitled';
        const preview = memory.content.slice(0, 80).replace(/\n/g, ' ');
        console.log(`  [${memory.status}] ${memory.createdAt} — ${title}`);
        console.log(`    ${preview}...`);
        if (memory.tags.length > 0) {
          console.log(`    tags: ${memory.tags.join(', ')}`);
        }
      }

      store.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Conflicts Command ───

program
  .command('conflicts')
  .description('List pending conflicts')
  .option('-d, --db <path>', 'Database file path')
  .action(async (options) => {
    try {
      const config = getStoreConfig(options.db);
      const store = new MemoryStore(config);
      await store.init();

      const conflicts = await store.getPendingConflicts();

      if (conflicts.length === 0) {
        console.log('No pending conflicts.');
        store.close();
        return;
      }

      console.log(`Pending conflicts: ${conflicts.length}\n`);
      for (const conflict of conflicts) {
        console.log(`  Conflict: ${conflict.id}`);
        console.log(`  Memories: ${conflict.memoryIds.join(', ')}`);
        console.log(`  Reason: ${conflict.reason ?? 'N/A'}`);
        console.log(`  Created: ${conflict.createdAt}`);
        console.log();
      }

      store.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program.parse();
