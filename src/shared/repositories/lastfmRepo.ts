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
    autoScrobbleEnabled: row.auto_scrobble_enabled as boolean,
    sanitizeScrobble: row.sanitize_scrobble as boolean,
    sanitizeNowPlaying: row.sanitize_now_playing as boolean,
    nowPlayingEnabled: row.now_playing_enabled as boolean,
  };
}

export async function setNowPlayingEnabled(enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE lastfm_sessions SET now_playing_enabled = $1', [enabled]);
}

export async function setAutoScrobble(enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE lastfm_sessions SET auto_scrobble_enabled = $1', [enabled]);
}

export async function setSanitizeScrobble(enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE lastfm_sessions SET sanitize_scrobble = $1', [enabled]);
}

export async function setSanitizeNowPlaying(enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE lastfm_sessions SET sanitize_now_playing = $1', [enabled]);
}

export async function deleteAll(): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM lastfm_sessions');
}
