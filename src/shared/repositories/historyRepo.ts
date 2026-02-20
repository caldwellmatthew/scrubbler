import { getPool } from '../db';
import type { HistoryQueryParams, ListenEvent, ListenHistoryRow, PollState } from '../types';

export async function getPollState(): Promise<PollState> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM poll_state WHERE id = 1');
  const row = result.rows[0];
  return {
    id: 1,
    lastPlayedAtMs: row.last_played_at_ms as number | null,
    lastPolledAt: row.last_polled_at as Date | null,
    pollEnabled: row.poll_enabled as boolean,
  };
}

export async function getLastPlayedAtMs(): Promise<number | null> {
  const state = await getPollState();
  return state.lastPlayedAtMs;
}

export async function setPollEnabled(enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE poll_state SET poll_enabled = $1 WHERE id = 1', [enabled]);
}

export async function updatePollState(lastPlayedAtMs: number): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE poll_state
     SET last_played_at_ms = $1, last_polled_at = NOW()
     WHERE id = 1`,
    [lastPlayedAtMs],
  );
}

export async function insertMany(events: ListenEvent[]): Promise<number> {
  if (events.length === 0) return 0;

  const pool = getPool();

  const values: unknown[] = [];
  const placeholders = events.map((event, i) => {
    const base = i * 3;
    values.push(event.spotifyTrackId, event.spotifyUserId, event.playedAt);
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });

  const result = await pool.query(
    `INSERT INTO listen_history (spotify_track_id, spotify_user_id, played_at)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (spotify_track_id, played_at) DO NOTHING`,
    values,
  );

  return result.rowCount ?? 0;
}

export async function queryHistory(params: HistoryQueryParams): Promise<ListenHistoryRow[]> {
  const pool = getPool();

  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const conditions: string[] = [];
  const values: unknown[] = [];

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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  values.push(limit, offset);
  const limitClause = `LIMIT $${values.length - 1} OFFSET $${values.length}`;

  const result = await pool.query(
    `SELECT
       lh.id,
       lh.spotify_track_id,
       lh.spotify_user_id,
       lh.played_at,
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

  return result.rows.map((row) => ({
    id: row.id as number,
    spotifyTrackId: row.spotify_track_id as string,
    spotifyUserId: row.spotify_user_id as string,
    playedAt: row.played_at as Date,
    name: row.name as string,
    artistName: row.artist_name as string,
    albumName: row.album_name as string,
    durationMs: row.duration_ms as number,
    externalUrl: row.external_url as string | null,
    previewUrl: row.preview_url as string | null,
    imageUrl: row.image_url as string | null,
  }));
}
