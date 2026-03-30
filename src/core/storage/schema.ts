/**
 * SQLite schema initialization for the Octomem memory storage system.
 */

import type { DatabaseSync } from 'node:sqlite';

/**
 * Initialize all database tables and indexes.
 */
export function initSchema(db: DatabaseSync): { vecAvailable: boolean; vecError?: string } {
  // 1.1 Memories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT NOT NULL,
      summary TEXT,
      key_points TEXT,
      embedding TEXT,
      confidence REAL DEFAULT 0.8,
      status TEXT DEFAULT 'active',
      chain_root_id TEXT,
      cluster_id TEXT,
      access_count INTEGER DEFAULT 0,
      source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_chain_root ON memories(chain_root_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_cluster ON memories(cluster_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);`);

  // 1.2 Segments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      text TEXT NOT NULL,
      hash TEXT NOT NULL,
      embedding TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_segments_memory ON segments(memory_id);`);

  // FTS5 full-text search
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
      text,
      id UNINDEXED,
      memory_id UNINDEXED
    );
  `);

  // 1.3 Tags table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      name TEXT PRIMARY KEY,
      embedding TEXT,
      count INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_tags (
      memory_id TEXT NOT NULL,
      tag_name TEXT NOT NULL,
      PRIMARY KEY (memory_id, tag_name),
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_name) REFERENCES tags(name)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_tags_tag ON memory_tags(tag_name);`);

  // 1.4 Conflicts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY,
      memory_ids TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      resolution TEXT,
      resolution_type TEXT,
      winner_id TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts(status);`);

  // 1.5 Embedding cache
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_cache (
      model TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding TEXT NOT NULL,
      dims INTEGER,
      created_at TEXT NOT NULL,
      PRIMARY KEY (model, content_hash)
    );
  `);

  // Try to create sqlite-vec table
  let vecAvailable = false;
  let vecError: string | undefined;
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS segments_vec USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[1536]
      );
    `);
    vecAvailable = true;
  } catch (err) {
    vecError = err instanceof Error ? err.message : String(err);
    vecAvailable = false;
  }

  return { vecAvailable, vecError };
}
