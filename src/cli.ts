#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { MemoryAgent } from './agent/index.js';
import type { AgentConfig } from './agent/types.js';
import { StagingManager } from './core/staging/staging.js';

const program = new Command();

program
  .name('octomem')
  .description('Octomem - Universal Agent Memory System')
  .version('0.0.2');

// ─── Helpers ───

function resolveRootDir(explicit?: string): string {
  if (explicit) return explicit;
  const localMemory = join(process.cwd(), 'memory');
  if (existsSync(localMemory)) return localMemory;
  return join(homedir(), '.octomem');
}

function getAgentConfig(dbPath?: string, rootDir?: string): AgentConfig {
  const resolved = resolveRootDir(rootDir);
  return {
    storage: {
      dbPath: dbPath ?? join(resolved, 'index.db'),
      embedding: {
        baseUrl: process.env.EMBEDDING_BASE_URL || process.env.LLM_BASE_URL,
        apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY,
        model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      },
    },
    llm: {
      baseUrl: process.env.LLM_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
    },
    paths: {
      rootDir: resolved,
    },
  };
}

function readStdin(): Promise<string> {
  return new Promise((res, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => res(data));
    process.stdin.on('error', reject);
  });
}

// ─── Init Command ───

program
  .command('init')
  .description('Initialize memory storage database and entities directory')
  .option('-d, --db <path>', 'Database file path')
  .option('--root <dir>', 'Root data directory')
  .action(async (options) => {
    try {
      const config = getAgentConfig(options.db, options.root);
      const agent = new MemoryAgent(config);
      await agent.init();
      console.log(`Memory storage initialized: ${config.storage.dbPath}`);
      agent.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Add Command ───

program
  .command('add [file]')
  .description('Add a memory from file, --text, or stdin')
  .option('-d, --db <path>', 'Database file path')
  .option('--root <dir>', 'Root data directory')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('--title <title>', 'Memory title')
  .option('--source <source>', 'Source identifier')
  .option('--text <string>', 'Direct text content')
  .option('--stdin', 'Read content from stdin')
  .option('--skip-format', 'Skip format stage')
  .option('--skip-validation', 'Skip validation stage')
  .option('--auto-merge', 'Auto-merge overlapping memories')
  .action(async (file, options) => {
    try {
      let content: string;
      if (options.text) {
        content = options.text;
      } else if (options.stdin) {
        content = await readStdin();
      } else if (file) {
        content = readFileSync(file, 'utf-8');
      } else {
        console.error('Provide a file, --text "content", or pipe via --stdin');
        process.exit(1);
        return;
      }

      const config = getAgentConfig(options.db, options.root);
      const agent = new MemoryAgent(config);
      await agent.init();

      const tags = options.tags
        ? options.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : undefined;

      const result = await agent.addMemory({
        content,
        title: options.title,
        tags,
        source: options.source ?? file ?? 'cli-text',
        skipFormat: options.skipFormat,
        skipValidation: options.skipValidation,
        autoMerge: options.autoMerge,
      });

      console.log(`Memory added: ${result.memory.id}`);
      console.log(`  Title: ${result.memory.title ?? 'N/A'}`);
      console.log(`  Confidence: ${result.memory.confidence}`);
      console.log(`  Tags: ${result.memory.tags.join(', ') || 'none'}`);
      console.log(`  File: ${result.filePath}`);
      if (result.merged) console.log('  Merged with existing memory');
      if (result.conflicted) console.log(`  Conflict detected: ${result.conflictId}`);

      agent.close();
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
  .option('--tags <tags>', 'Filter by comma-separated tags')
  .action(async (query, options) => {
    try {
      const config = getAgentConfig(options.db);
      const agent = new MemoryAgent(config);
      await agent.init();

      const filterTags = options.tags
        ? options.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : undefined;

      const results = await agent.search({
        query,
        maxResults: Number(options.limit),
        filterTags,
      });

      if (results.length === 0) {
        console.log('No results found.');
        agent.close();
        return;
      }

      for (const result of results) {
        const title = result.memory.title ?? 'Untitled';
        console.log(`\n[${result.score.toFixed(3)}] ${title} (${result.memoryId})`);
        console.log(`  ${result.snippet}`);
        if (result.memory.tags.length > 0) {
          console.log(`  Tags: ${result.memory.tags.join(', ')}`);
        }
      }

      agent.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Conflicts Command ───

program
  .command('conflicts')
  .description('List or resolve pending conflicts')
  .option('-d, --db <path>', 'Database file path')
  .option('--resolve <id>', 'Resolve a conflict by ID')
  .option('--winner <memoryId>', 'Winner memory ID for conflict resolution')
  .action(async (options) => {
    try {
      const config = getAgentConfig(options.db);
      const agent = new MemoryAgent(config);
      await agent.init();

      if (options.resolve) {
        if (!options.winner) {
          console.error('Please specify --winner <memoryId> when resolving.');
          process.exit(1);
        }
        const result = await agent.resolveConflict({
          conflictId: options.resolve,
          hint: options.winner,
        });
        console.log(`Conflict resolved: ${result.winnerId}`);
        agent.close();
        return;
      }

      const conflicts = await agent.rawStore.getPendingConflicts();

      if (conflicts.length === 0) {
        console.log('No pending conflicts.');
        agent.close();
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

      agent.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Chain Command ───

program
  .command('chain <id>')
  .description('View memory iteration chain')
  .option('-d, --db <path>', 'Database file path')
  .action(async (id, options) => {
    try {
      const config = getAgentConfig(options.db);
      const agent = new MemoryAgent(config);
      await agent.init();

      const chain = await agent.rawStore.getMemoryChain(id);

      if (chain.length === 0) {
        console.log(`No memories found for chain: ${id}`);
        agent.close();
        return;
      }

      console.log(`Chain: ${id} (${chain.length} memories)\n`);
      for (const memory of chain) {
        const title = memory.title ?? 'Untitled';
        const preview = memory.content.slice(0, 80).replace(/\n/g, ' ');
        console.log(`  [${memory.status}] ${memory.createdAt} — ${title}`);
        console.log(`    ${preview}...`);
        if (memory.tags.length > 0) {
          console.log(`    Tags: ${memory.tags.join(', ')}`);
        }
      }

      agent.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Export Command ───

program
  .command('export [dir]')
  .description('Export memories as md files')
  .option('-d, --db <path>', 'Database file path')
  .option('--root <dir>', 'Root data directory')
  .option('--tags <tags>', 'Filter by comma-separated tags')
  .option('--all', 'Include non-active memories')
  .action(async (dir, options) => {
    try {
      const outputDir = dir ?? './export';
      const config = getAgentConfig(options.db, options.root);
      const agent = new MemoryAgent(config);
      await agent.init();

      const filterTags = options.tags
        ? options.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : undefined;

      const result = await agent.export({
        outputDir: resolve(outputDir),
        filterTags,
        activeOnly: !options.all,
      });

      console.log(`Exported ${result.fileCount} file(s) to ${result.outputDir}`);
      if (result.skipped > 0) {
        console.log(`Skipped ${result.skipped} file(s)`);
      }

      agent.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Resume Command ───

program
  .command('resume')
  .description('Resume interrupted staging jobs')
  .option('--root <dir>', 'Root data directory')
  .action(async (options) => {
    try {
      const rootDir = resolveRootDir(options.root);
      const staging = new StagingManager(rootDir);
      const jobs = staging.getIncompleteJobs();

      if (jobs.length === 0) {
        console.log('No incomplete jobs to resume.');
        return;
      }

      console.log(`Found ${jobs.length} incomplete job(s):\n`);
      for (const job of jobs) {
        const completed = Object.entries(job.stages)
          .filter(([, status]) => status === 'completed')
          .map(([stage]) => stage);
        console.log(`  Job: ${job.jobId}`);
        console.log(`  Source: ${job.source ?? 'N/A'}`);
        console.log(`  Current stage: ${job.currentStage}`);
        console.log(`  Completed: ${completed.join(', ') || 'none'}`);
        console.log(`  Created: ${job.createdAt}`);
        console.log();
      }

      console.log('Resume is not yet automated. Re-run the original command to retry.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

// ─── Tags Command ───

program
  .command('tags')
  .description('List all tags')
  .option('-d, --db <path>', 'Database file path')
  .action(async (options) => {
    try {
      const config = getAgentConfig(options.db);
      const agent = new MemoryAgent(config);
      await agent.init();

      const tags = await agent.rawStore.getTags();

      if (tags.length === 0) {
        console.log('No tags found.');
        agent.close();
        return;
      }

      console.log(`Tags (${tags.length}):\n`);
      for (const tag of tags) {
        console.log(`  ${tag.name} (${tag.count})`);
      }

      agent.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program.parse();
