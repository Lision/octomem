/**
 * Tests for schema initialization.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { initSchema } from '../schema.js';
import { openConnection, closeConnection } from '../connection.js';
import type { DatabaseSync } from 'node:sqlite';

describe('Schema', () => {
  let db: DatabaseSync | null = null;
  let tempDir: string;

  afterEach(() => {
    if (db) {
      closeConnection(db);
      db = null;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create all required tables', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'octomem-test-'));
    const dbPath = join(tempDir, 'test.db');
    const result = await openConnection({ dbPath, tryLoadVec: false });
    db = result.db;

    initSchema(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('memories');
    expect(tableNames).toContain('segments');
    expect(tableNames).toContain('tags');
    expect(tableNames).toContain('memory_tags');
    expect(tableNames).toContain('conflicts');
    expect(tableNames).toContain('embedding_cache');
  });

  it('should create FTS5 virtual table', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'octomem-test-'));
    const dbPath = join(tempDir, 'test.db');
    const result = await openConnection({ dbPath, tryLoadVec: false });
    db = result.db;

    initSchema(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('segments_fts');
  });

  it('should create all required indexes', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'octomem-test-'));
    const dbPath = join(tempDir, 'test.db');
    const result = await openConnection({ dbPath, tryLoadVec: false });
    db = result.db;

    initSchema(db);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_memories_status');
    expect(indexNames).toContain('idx_memories_chain_root');
    expect(indexNames).toContain('idx_memories_created_at');
    expect(indexNames).toContain('idx_segments_memory');
    expect(indexNames).toContain('idx_memory_tags_tag');
    expect(indexNames).toContain('idx_conflicts_status');
  });

  it('should be idempotent (safe to call multiple times)', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'octomem-test-'));
    const dbPath = join(tempDir, 'test.db');
    const result = await openConnection({ dbPath, tryLoadVec: false });
    db = result.db;

    initSchema(db);
    initSchema(db); // Second call should not throw

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.length).toBeGreaterThan(0);
  });

  it('should have WAL mode enabled', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'octomem-test-'));
    const dbPath = join(tempDir, 'test.db');
    const result = await openConnection({ dbPath, tryLoadVec: false });
    db = result.db;

    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string } | undefined;
    expect(row?.journal_mode).toBe('wal');
  });
});
