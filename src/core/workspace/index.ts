import { mkdir, readdir, readFile, writeFile, rename, stat } from 'fs/promises';
import { join, basename } from 'path';
import type { Workspace, WorkspaceDir } from './types.js';

/**
 * Manages workspace directories for agent file processing.
 * Each workspace has pending, processing, and completed subdirectories.
 */
export class WorkspaceManager {
  private baseWorkspacesPath: string;

  constructor(baseWorkspacesPath?: string) {
    // Default to workspaces/ in project root
    this.baseWorkspacesPath = baseWorkspacesPath || join(process.cwd(), 'workspaces');
  }

  /**
   * Initialize a workspace with the given name.
   * Creates the directory structure if it doesn't exist.
   */
  async init(name: string): Promise<Workspace> {
    const basePath = join(this.baseWorkspacesPath, name);
    const workspace: Workspace = {
      name,
      basePath,
      pending: join(basePath, 'pending'),
      processing: join(basePath, 'processing'),
      completed: join(basePath, 'completed'),
    };

    // Create directories if they don't exist
    await mkdir(workspace.pending, { recursive: true });
    await mkdir(workspace.processing, { recursive: true });
    await mkdir(workspace.completed, { recursive: true });

    return workspace;
  }

  /**
   * Get list of files in the pending directory
   */
  async getPendingFiles(workspace: Workspace): Promise<string[]> {
    return this.listFiles(workspace, 'pending');
  }

  /**
   * List all files in a workspace directory
   */
  private async listFiles(workspace: Workspace, dir: WorkspaceDir): Promise<string[]> {
    const dirPath = workspace[dir];
    const entries = await readdir(dirPath, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  }

  /**
   * Move a file from pending to processing directory
   */
  async moveToProcessing(workspace: Workspace, filename: string): Promise<string> {
    return this.moveFile(workspace, 'pending', 'processing', filename);
  }

  /**
   * Move a file from processing to completed directory
   */
  async moveToCompleted(workspace: Workspace, filename: string): Promise<string> {
    return this.moveFile(workspace, 'processing', 'completed', filename);
  }

  /**
   * Move a file between workspace directories
   */
  private async moveFile(
    workspace: Workspace,
    from: WorkspaceDir,
    to: WorkspaceDir,
    filename: string
  ): Promise<string> {
    const sourcePath = join(workspace[from], filename);
    const destPath = join(workspace[to], filename);

    await rename(sourcePath, destPath);
    return destPath;
  }

  /**
   * Read file content from a workspace directory
   */
  async readFile(workspace: Workspace, dir: WorkspaceDir, filename: string): Promise<string> {
    const filePath = join(workspace[dir], filename);
    return readFile(filePath, 'utf-8');
  }

  /**
   * Write file content to the completed directory
   */
  async writeCompletedFile(workspace: Workspace, filename: string, content: string): Promise<string> {
    const filePath = join(workspace.completed, filename);
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Write file content to the processing directory
   */
  async writeProcessingFile(workspace: Workspace, filename: string, content: string): Promise<string> {
    const filePath = join(workspace.processing, filename);
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Check if a workspace exists
   */
  async exists(name: string): Promise<boolean> {
    try {
      const basePath = join(this.baseWorkspacesPath, name);
      await stat(basePath);
      return true;
    } catch {
      return false;
    }
  }
}

export type { Workspace, WorkspaceDir } from './types.js';
