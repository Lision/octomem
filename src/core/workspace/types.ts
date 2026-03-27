/**
 * Workspace directory structure for agent file processing
 */
export interface Workspace {
  /** Name of the workspace (e.g., 'formatter') */
  name: string;
  /** Base path of the workspace */
  basePath: string;
  /** Path to pending files */
  pending: string;
  /** Path to files being processed */
  processing: string;
  /** Path to completed files */
  completed: string;
}

/**
 * Directory states within a workspace
 */
export type WorkspaceDir = 'pending' | 'processing' | 'completed';
