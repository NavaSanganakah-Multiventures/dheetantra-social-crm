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

  try {
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
      try {
        await db.batch(stmts);
      } catch (err: any) {
        // Multiple isolates can race to apply the same changes on a cold start.
        // If the schema is already up-to-date now, another isolate won the race;
        // treat that as success. Otherwise surface the real error so the next
        // request retries.
        const recheck = await diffSchema(db, schemaSqlContent);
        if (recheck.missingTables.length === 0 && recheck.missingColumns.length === 0) {
          console.log('[AutoMigrate] Schema already up-to-date (concurrent migration applied it first).');
        } else {
          throw err;
        }
      }
    }

    if (applied.length > 0) {
      console.log('[AutoMigrate] Applied ' + applied.length + ' schema change(s): ' + applied.join(', '));
    }

    return applied;
  } finally {
    // Always restore FK enforcement, even when the batch throws.
    try { await db.prepare('PRAGMA foreign_keys = ON').run(); } catch { /* ignore */ }
  }
}
