import { getPool } from '../db';
import type { LastfmSession } from '../types';

export async function upsertSession(username: string, sessionKey: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM lastfm_sessions');
  await pool.query('INSERT INTO lastfm_sessions (username, session_key) VALUES ($1, $2)', [
    username,
    sessionKey,
  ]);
}

export async function getSession(): Promise<LastfmSession | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM lastfm_sessions ORDER BY id DESC LIMIT 1');
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    username: row.username as string,
    sessionKey: row.session_key as string,
    createdAt: row.created_at as Date,
  };
}

export async function deleteAll(): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM lastfm_sessions');
}
