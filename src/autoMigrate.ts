/// <reference path="./worker-env.d.ts" />
import schemaSqlContent from '../schema.sql';
import { diffSchema } from './schema';

let migrationPromise: Promise<string[]> | null = null;

/**
 * Idempotently synchronizes the live D1 database with schema.sql.
 *
 * Runs once per isolate (the promise is cached), so the first request after a
 * deploy pays the (small) cost of the schema diff and any pending changes are
 * applied before the request is routed. Later requests reuse the resolved
 * promise. If a run fails, the promise is reset so the next request retries.
 */
export function autoMigrate(db: any): Promise<string[]> {
  if (!migrationPromise) {
    migrationPromise = run(db).catch((err: any) => {
      migrationPromise = null;
      throw err;
    });
  }
  return migrationPromise;
}

async function run(db: any): Promise<string[]> {
  const applied: string[] = [];

  // Creating tables that reference each other via FK is safer with the pragma
  // off for the batch (mirrors the existing /api/admin/migrate endpoint).
  try { await db.prepare('PRAGMA foreign_keys = OFF').run(); } catch { /* ignore */ }

  const diff = await diffSchema(db, schemaSqlContent);
  const stmts: any[] = [];

  for (const t of diff.missingTables) {
    stmts.push(db.prepare(t.sql));
    applied.push('CREATE TABLE ' + t.name);
  }

  for (const col of diff.missingColumns) {
    stmts.push(db.prepare(col.sql));
    applied.push('ALTER TABLE ' + col.table + ' ADD COLUMN ' + col.column);
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  try { await db.prepare('PRAGMA foreign_keys = ON').run(); } catch { /* ignore */ }

  if (applied.length > 0) {
    console.log('[AutoMigrate] Applied ' + applied.length + ' schema change(s): ' + applied.join(', '));
  }

  return applied;
}
