import { getPool } from '../db';
import type { PoolClient } from 'pg';
import type { HistoryQueryParams, ListenEvent, ListenHistoryRow, PollState } from '../types';

export async function getPollState(spotifyUserId: string): Promise<PollState> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM poll_state WHERE spotify_user_id = $1', [spotifyUserId]);
  if (result.rows.length === 0) {
    // Return default state for a user who hasn't polled yet
    return {
      spotifyUserId,
      lastPlayedAtMs: null,
      lastPolledAt: null,
      pollEnabled: true,
    };
  }
  const row = result.rows[0];
  return {
    spotifyUserId: row.spotify_user_id as string,
    lastPlayedAtMs: row.last_played_at_ms as number | null,
    lastPolledAt: row.last_polled_at as Date | null,
    pollEnabled: row.poll_enabled as boolean,
  };
}

export async function setPollEnabled(spotifyUserId: string, enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO poll_state (spotify_user_id, poll_enabled)
     VALUES ($1, $2)
     ON CONFLICT (spotify_user_id) DO UPDATE SET poll_enabled = EXCLUDED.poll_enabled`,
    [spotifyUserId, enabled],
  );
}

export async function updatePollState(spotifyUserId: string, lastPlayedAtMs: number | null): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO poll_state (spotify_user_id, last_played_at_ms, last_polled_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (spotify_user_id) DO UPDATE SET
       last_played_at_ms = COALESCE(EXCLUDED.last_played_at_ms, poll_state.last_played_at_ms),
       last_polled_at    = NOW()`,
    [spotifyUserId, lastPlayedAtMs],
  );
}

export async function insertMany(events: ListenEvent[], client?: PoolClient): Promise<number> {
  if (events.length === 0) return 0;

  const pool = client ?? getPool();

  const values: unknown[] = [];
  const placeholders = events.map((event, i) => {
    const base = i * 3;
    values.push(event.spotifyTrackId, event.spotifyUserId, event.playedAt);
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });

  const result = await pool.query(
    `INSERT INTO listen_history (spotify_track_id, spotify_user_id, played_at)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (spotify_user_id, spotify_track_id, played_at) DO NOTHING`,
    values,
  );

  return result.rowCount ?? 0;
}

export async function queryHistory(params: HistoryQueryParams, spotifyUserId: string): Promise<ListenHistoryRow[]> {
  const pool = getPool();

  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const conditions: string[] = [];
  const values: unknown[] = [];

  values.push(spotifyUserId);
  conditions.push(`lh.spotify_user_id = $${values.length}`);

  if (params.before) {
    values.push(params.before);
    conditions.push(`lh.played_at < $${values.length}`);
  }

  if (params.after) {
    values.push(params.after);
    conditions.push(`lh.played_at > $${values.length}`);
  }

  if (params.track_id) {
    values.push(params.track_id);
    conditions.push(`lh.spotify_track_id = $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  values.push(limit, offset);
  const limitClause = `LIMIT $${values.length - 1} OFFSET $${values.length}`;

  const result = await pool.query(
    `SELECT
       lh.id,
       lh.spotify_track_id,
       lh.spotify_user_id,
       lh.played_at,
       lh.scrobbled_at,
       lh.scrobble_sanitized,
       t.name,
       t.artist_name,
       t.album_name,
       t.duration_ms,
       t.external_url,
       t.preview_url,
       t.image_url
     FROM listen_history lh
     JOIN tracks t ON t.spotify_track_id = lh.spotify_track_id
     ${where}
     ORDER BY lh.played_at DESC
     ${limitClause}`,
    values,
  );

  return result.rows.map(mapRow);
}

function mapRow(row: Record<string, unknown>): ListenHistoryRow {
  return {
    id: String(row.id),
    spotifyTrackId: row.spotify_track_id as string,
    spotifyUserId: row.spotify_user_id as string,
    playedAt: row.played_at as Date,
    scrobbledAt: row.scrobbled_at as Date | null,
    scrobbleSanitized: row.scrobble_sanitized as boolean | null,
    name: row.name as string,
    artistName: row.artist_name as string,
    albumName: row.album_name as string,
    durationMs: row.duration_ms as number,
    externalUrl: row.external_url as string | null,
    previewUrl: row.preview_url as string | null,
    imageUrl: row.image_url as string | null,
  };
}

export async function getByIds(ids: string[], spotifyUserId: string): Promise<ListenHistoryRow[]> {
  if (ids.length === 0) return [];
  const pool = getPool();
  const result = await pool.query(
    `SELECT
       lh.id,
       lh.spotify_track_id,
       lh.spotify_user_id,
       lh.played_at,
       lh.scrobbled_at,
       lh.scrobble_sanitized,
       t.name,
       t.artist_name,
       t.album_name,
       t.duration_ms,
       t.external_url,
       t.preview_url,
       t.image_url
     FROM listen_history lh
     JOIN tracks t ON t.spotify_track_id = lh.spotify_track_id
     WHERE lh.id = ANY($1) AND lh.spotify_user_id = $2`,
    [ids, spotifyUserId],
  );
  return result.rows.map(mapRow);
}

export async function getUnscrobbledByPlayedAts(spotifyUserId: string, playedAts: Date[]): Promise<ListenHistoryRow[]> {
  if (playedAts.length === 0) return [];
  const pool = getPool();
  const result = await pool.query(
    `SELECT lh.id, lh.spotify_track_id, lh.spotify_user_id, lh.played_at, lh.scrobbled_at, lh.scrobble_sanitized,
            t.name, t.artist_name, t.album_name, t.duration_ms,
            t.external_url, t.preview_url, t.image_url
     FROM listen_history lh
     JOIN tracks t ON t.spotify_track_id = lh.spotify_track_id
     WHERE lh.spotify_user_id = $1 AND lh.played_at = ANY($2) AND lh.scrobbled_at IS NULL`,
    [spotifyUserId, playedAts],
  );
  return result.rows.map(mapRow);
}

export async function markScrobbled(ids: string[], sanitized: boolean): Promise<void> {
  if (ids.length === 0) return;
  const pool = getPool();
  await pool.query(
    'UPDATE listen_history SET scrobbled_at = NOW(), scrobble_sanitized = $2 WHERE id = ANY($1)',
    [ids, sanitized],
  );
}
