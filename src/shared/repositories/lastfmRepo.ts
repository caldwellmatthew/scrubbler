import { getPool } from '../db';
import type { LastfmSession } from '../types';

function rowToSession(row: Record<string, unknown>): LastfmSession {
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

export async function upsertSession(spotifyUserId: string, username: string, sessionKey: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO lastfm_sessions (spotify_user_id, username, session_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (spotify_user_id) DO UPDATE SET
       username    = EXCLUDED.username,
       session_key = EXCLUDED.session_key`,
    [spotifyUserId, username, sessionKey],
  );
}

export async function getSession(spotifyUserId: string): Promise<LastfmSession | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM lastfm_sessions WHERE spotify_user_id = $1', [spotifyUserId]);
  if (result.rows.length === 0) return null;
  return rowToSession(result.rows[0]);
}

export async function setNowPlayingEnabled(spotifyUserId: string, enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE lastfm_sessions SET now_playing_enabled = $2 WHERE spotify_user_id = $1', [spotifyUserId, enabled]);
}

export async function setAutoScrobble(spotifyUserId: string, enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE lastfm_sessions SET auto_scrobble_enabled = $2 WHERE spotify_user_id = $1', [spotifyUserId, enabled]);
}

export async function setSanitizeScrobble(spotifyUserId: string, enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE lastfm_sessions SET sanitize_scrobble = $2 WHERE spotify_user_id = $1', [spotifyUserId, enabled]);
}

export async function setSanitizeNowPlaying(spotifyUserId: string, enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE lastfm_sessions SET sanitize_now_playing = $2 WHERE spotify_user_id = $1', [spotifyUserId, enabled]);
}

export async function deleteBySpotifyUserId(spotifyUserId: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM lastfm_sessions WHERE spotify_user_id = $1', [spotifyUserId]);
}
