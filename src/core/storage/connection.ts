/**
 * SQLite connection management with sqlite-vec extension support.
 */

import type { DatabaseSync } from 'node:sqlite';

export interface ConnectionResult {
  db: DatabaseSync;
  vecAvailable: boolean;
  vecError?: string;
}

/**
 * Open a SQLite database connection and optionally load sqlite-vec extension.
 */
export async function openConnection(params: {
  dbPath: string;
  tryLoadVec?: boolean;
}): Promise<ConnectionResult> {
  const { mkdirSync, existsSync } = await import('node:fs');
  const { dirname } = await import('node:path');

  // Ensure parent directory exists
  const dir = dirname(params.dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(params.dbPath);

  // Enable WAL mode for better concurrent read performance
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  let vecAvailable = false;
  let vecError: string | undefined;

  if (params.tryLoadVec) {
    try {
      // @ts-expect-error — sqlite-vec may not have type declarations
      const sqliteVec = await import('sqlite-vec');
      sqliteVec.load(db);
      vecAvailable = true;
    } catch (err) {
      vecError = err instanceof Error ? err.message : String(err);
      vecAvailable = false;
    }
  }

  return { db, vecAvailable, vecError };
}

/**
 * Close a SQLite database connection.
 */
export function closeConnection(db: DatabaseSync): void {
  try {
    db.close();
  } catch {
    // Ignore close errors
  }
}
