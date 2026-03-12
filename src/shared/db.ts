import { Pool } from 'pg';
import { config } from './config';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }
  return pool;
}

/** Verify the database is reachable. Throws with a friendly message on failure. */
export async function checkConnection(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

/** Check if an error is a database connection failure (refused, timeout, shutdown). */
export function isDbConnectionError(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT'
    || code === '57P01' /* admin_shutdown */ || code === '57P03' /* cannot_connect_now */;
}

/** Extract a useful message from a DB error (AggregateError has an empty message). */
export function dbErrorMessage(err: unknown): string {
  const errors = (err as { errors?: Error[] }).errors;
  if (errors?.length && errors[0]?.message) {
    return errors[0].message;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return String(err);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
