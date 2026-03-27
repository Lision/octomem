#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { FormatterAgent } from './agents/formatter/index.js';
import { WorkspaceManager } from './core/workspace/index.js';

const program = new Command();

program
  .name('octomem')
  .description('Octomem - Universal Agent Memory System')
  .version('0.0.1');

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
        // Read from stdin
        const content = readFileSync(0, 'utf-8');
        const result = await agent.format({ content });
        console.log(result.content);
      } else if (options.all) {
        // Process all pending files
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

          // Write formatted content to completed directory
          await workspaceManager.writeCompletedFile(workspace, filename, result.content);

          // Delete the original file from processing directory
          const { unlink } = await import('fs/promises');
          await unlink(`${workspace.processing}/${filename}`);

          console.log(`Completed: ${filename}`);
        }

        console.log(`\nAll ${files.length} file(s) processed.`);
      } else if (file) {
        // Process single file
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

program.parse();
