/**
 * Apply pending SQL migrations from migrations/, recording each applied file
 * in a schema_migrations table so a file runs exactly once. Files are applied
 * in filename order, each inside its own transaction.
 *
 * Migrations are forward-only: there are no down scripts. Recover from a bad
 * migration with a new migration, or by restoring the database.
 *
 * The checksum of every applied file is recorded and re-verified on each run,
 * so editing a migration that has already run is reported as an error instead
 * of silently leaving environments with divergent schemas.
 *
 * Usage:
 *   migrate              Apply pending migrations
 *   migrate --baseline   Adopt an existing database whose schema already
 *                        matches the migration set: record every file as
 *                        applied without running it. Only valid when nothing
 *                        has been recorded yet.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getPool, closePool, dbErrorMessage } from '../shared/db';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

// Arbitrary constant; serializes concurrent migrate runs against the same DB
const ADVISORY_LOCK_KEY = 727_001;

interface Migration {
  filename: string;
  sql: string;
  checksum: string;
}

/**
 * Hash of a migration's contents, over newline-normalized text so that a
 * checkout which rewrote line endings does not read as an edited migration.
 */
function checksumOf(sql: string): string {
  return crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

function readMigrations(): Migration[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((filename) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
      return { filename, sql, checksum: checksumOf(sql) };
    });
}

async function main(): Promise<void> {
  const baselining = process.argv.includes('--baseline');
  const migrations = readMigrations();

  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);

    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename   TEXT        PRIMARY KEY,
         checksum   TEXT        NOT NULL,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );

    const applied = new Map<string, string>(
      (await client.query('SELECT filename, checksum FROM schema_migrations')).rows.map(
        (row) => [row.filename as string, row.checksum as string],
      ),
    );

    if (baselining) {
      if (applied.size > 0) {
        throw new Error(
          `Cannot baseline: ${applied.size} migration(s) already recorded. ` +
            'Baselining is only for adopting a database that predates this tracking.',
        );
      }
      await client.query('BEGIN');
      for (const { filename, checksum } of migrations) {
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [filename, checksum],
        );
      }
      await client.query('COMMIT');
      console.log(`[migrate] Baselined — recorded ${migrations.length} migration(s) as applied`);
      return;
    }

    // An applied migration whose contents changed means this database's schema
    // no longer matches what the repository describes. Refuse rather than
    // apply later files on top of an unknown starting point.
    const edited = migrations.filter(
      (m) => applied.has(m.filename) && applied.get(m.filename) !== m.checksum,
    );
    if (edited.length > 0) {
      throw new Error(
        `Already-applied migration(s) have been modified: ${edited
          .map((m) => m.filename)
          .join(', ')}. Revert the edits, or add a new migration for the change.`,
      );
    }

    const onDisk = new Set(migrations.map((m) => m.filename));
    const missing = [...applied.keys()].filter((filename) => !onDisk.has(filename));
    if (missing.length > 0) {
      console.warn(
        `[migrate] Warning: ${missing.length} applied migration(s) are absent from ` +
          `${MIGRATIONS_DIR}: ${missing.join(', ')}`,
      );
    }

    const pending = migrations.filter((m) => !applied.has(m.filename));
    if (pending.length === 0) {
      console.log(`[migrate] Up to date (${applied.size} migrations applied)`);
      return;
    }

    // A pending file sorting before one already applied would run out of order,
    // leaving this database with a different application order than one built
    // fresh from the same tree. It normally means two branches numbered their
    // migrations independently. Refuse, so the file gets renumbered rather than
    // silently diverging.
    const latestApplied = [...applied.keys()].sort().pop();
    const outOfOrder = latestApplied === undefined
      ? []
      : pending.filter((m) => m.filename < latestApplied);
    if (outOfOrder.length > 0) {
      throw new Error(
        `Migration(s) sort before ${latestApplied}, which is already applied: ` +
          `${outOfOrder.map((m) => m.filename).join(', ')}. ` +
          'Renumber them to follow the applied migrations, then run again.',
      );
    }

    for (const { filename, sql, checksum } of pending) {
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [filename, checksum],
        );
        await client.query('COMMIT');
        console.log(`[migrate] Applied ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${filename} failed (rolled back): ${dbErrorMessage(err)}`);
      }
    }
    console.log(`[migrate] Done — applied ${pending.length} pending migration(s)`);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    } catch {
      // Connection may already be gone; the lock dies with its session anyway.
      // Swallow so the original error propagates and release still runs.
    } finally {
      client.release();
    }
  }
}

main()
  .catch((err) => {
    console.error(`[migrate] Failed: ${dbErrorMessage(err)}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
