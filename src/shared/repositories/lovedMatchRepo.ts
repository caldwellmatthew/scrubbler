import { getPool } from '../db';
import type { LovedTrack } from '../lastfm/loved';
import type { LovedMatchCandidate, LovedMatchRow, LovedMatchStatus, ResolvedMatch } from '../types';

const COLUMNS = `id, spotify_user_id, lastfm_username, lastfm_artist, lastfm_track, loved_at, status,
                 spotify_track_id, spotify_track_name, spotify_artist_names, spotify_album_name,
                 spotify_image_url, spotify_external_url, spotify_duration_ms,
                 match_score, candidates, searched_at, synced_at`;

function rowToMatch(row: Record<string, unknown>): LovedMatchRow {
  return {
    id: String(row.id),
    spotifyUserId: row.spotify_user_id as string,
    lastfmUsername: row.lastfm_username as string,
    lastfmArtist: row.lastfm_artist as string,
    lastfmTrack: row.lastfm_track as string,
    lovedAt: row.loved_at as Date | null,
    status: row.status as LovedMatchStatus,
    spotifyTrackId: row.spotify_track_id as string | null,
    spotifyTrackName: row.spotify_track_name as string | null,
    spotifyArtistNames: row.spotify_artist_names as string[] | null,
    spotifyAlbumName: row.spotify_album_name as string | null,
    spotifyImageUrl: row.spotify_image_url as string | null,
    spotifyExternalUrl: row.spotify_external_url as string | null,
    spotifyDurationMs: row.spotify_duration_ms as number | null,
    matchScore: row.match_score as number | null,
    candidates: (row.candidates as LovedMatchCandidate[] | null) ?? [],
    searchedAt: row.searched_at as Date | null,
    syncedAt: row.synced_at as Date | null,
  };
}

/**
 * Record loved tracks we haven't seen before, leaving existing rows untouched
 * so prior matches and user decisions survive a re-scan. Returns how many were
 * new, which is what tells the scan whether it has caught up.
 */
export async function mirrorLoved(
  spotifyUserId: string,
  lastfmUsername: string,
  tracks: LovedTrack[],
): Promise<number> {
  if (tracks.length === 0) return 0;
  const pool = getPool();

  // Postgres rejects an ON CONFLICT that touches the same row twice in one
  // statement, and a loved list can repeat an artist/track pair.
  const seen = new Set<string>();
  const unique = tracks.filter((t) => {
    const key = `${t.artist}\x00${t.track}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const values: unknown[] = [];
  const placeholders = unique.map((track, i) => {
    const base = i * 5;
    values.push(spotifyUserId, lastfmUsername, track.artist, track.track, track.lovedAt);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  const result = await pool.query(
    `INSERT INTO lastfm_loved_matches (spotify_user_id, lastfm_username, lastfm_artist, lastfm_track, loved_at)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT ON CONSTRAINT lastfm_loved_matches_natural_key DO NOTHING`,
    values,
  );
  return result.rowCount ?? 0;
}

/** Loved tracks we have never searched for, newest love first. */
export async function getUnsearched(
  spotifyUserId: string,
  lastfmUsername: string,
  limit: number,
  includeNoMatch: boolean,
): Promise<LovedMatchRow[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM lastfm_loved_matches
     WHERE spotify_user_id = $1 AND lastfm_username = $2
       AND ((status = 'pending' AND searched_at IS NULL) OR ($3 AND status = 'no_match'))
     ORDER BY loved_at DESC NULLS LAST, id DESC
     LIMIT $4`,
    [spotifyUserId, lastfmUsername, includeNoMatch, limit],
  );
  return result.rows.map(rowToMatch);
}

/** Matches already resolved but still awaiting the user's verdict. */
export async function getSearchedPending(
  spotifyUserId: string,
  lastfmUsername: string,
  limit: number,
  offset: number,
): Promise<LovedMatchRow[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM lastfm_loved_matches
     WHERE spotify_user_id = $1 AND lastfm_username = $2
       AND status IN ('pending', 'no_match') AND searched_at IS NOT NULL
     ORDER BY loved_at DESC NULLS LAST, id DESC
     LIMIT $3 OFFSET $4`,
    [spotifyUserId, lastfmUsername, limit, offset],
  );
  return result.rows.map(rowToMatch);
}

export async function getByIds(ids: string[], spotifyUserId: string): Promise<LovedMatchRow[]> {
  if (ids.length === 0) return [];
  const pool = getPool();
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM lastfm_loved_matches
     WHERE id = ANY($1::bigint[]) AND spotify_user_id = $2`,
    [ids, spotifyUserId],
  );
  return result.rows.map(rowToMatch);
}

/**
 * Store the outcome of searching for one loved track. A null match records a
 * definitive "nothing acceptable in the catalog" — callers must not use it for
 * a search that merely failed, or the track is hidden from every future scan.
 *
 * A found match resets the row to 'pending' so that a retried 'no_match' row
 * rejoins the review queue rather than keeping its old terminal status.
 */
export async function recordMatch(id: string, match: ResolvedMatch | null): Promise<void> {
  const pool = getPool();

  if (!match) {
    await pool.query(
      `UPDATE lastfm_loved_matches
       SET status = 'no_match', searched_at = NOW(), match_score = NULL, candidates = '[]'::jsonb
       WHERE id = $1`,
      [id],
    );
    return;
  }

  await pool.query(
    `UPDATE lastfm_loved_matches
     SET status               = 'pending',
         spotify_track_id     = $2,
         spotify_track_name   = $3,
         spotify_artist_names = $4,
         spotify_album_name   = $5,
         spotify_image_url    = $6,
         spotify_external_url = $7,
         spotify_duration_ms  = $8,
         match_score          = $9,
         candidates           = $10::jsonb,
         searched_at          = NOW()
     WHERE id = $1`,
    [
      id,
      match.spotifyTrackId,
      match.name,
      match.artistNames,
      match.albumName,
      match.imageUrl,
      match.externalUrl,
      match.durationMs,
      match.score,
      // node-postgres renders a JS array as a Postgres array literal, which is
      // not valid jsonb — serialize explicitly.
      JSON.stringify(match.candidates),
    ],
  );
}

export async function markStatus(ids: string[], status: LovedMatchStatus): Promise<void> {
  if (ids.length === 0) return;
  const pool = getPool();
  await pool.query(
    'UPDATE lastfm_loved_matches SET status = $2 WHERE id = ANY($1::bigint[])',
    [ids, status],
  );
}

/**
 * Mark rows as saved to Spotify, recording the track actually saved — which
 * may differ from the auto-matched one when the user picked an alternate.
 */
export async function markSynced(
  entries: Array<{ id: string; spotifyTrackId: string }>,
  status: Extract<LovedMatchStatus, 'synced' | 'already_liked'>,
): Promise<void> {
  if (entries.length === 0) return;
  const pool = getPool();
  await pool.query(
    `UPDATE lastfm_loved_matches m
     SET status = $3, synced_at = NOW(), spotify_track_id = v.track_id
     FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::text[]) AS track_id) v
     WHERE m.id = v.id`,
    [entries.map((e) => e.id), entries.map((e) => e.spotifyTrackId), status],
  );
}

export async function countByStatus(spotifyUserId: string): Promise<Record<LovedMatchStatus, number>> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM lastfm_loved_matches
     WHERE spotify_user_id = $1 GROUP BY status`,
    [spotifyUserId],
  );

  const counts: Record<LovedMatchStatus, number> = {
    pending: 0, synced: 0, already_liked: 0, rejected: 0, no_match: 0,
  };
  for (const row of result.rows) {
    counts[row.status as LovedMatchStatus] = row.count as number;
  }
  return counts;
}

export async function countUnsearched(spotifyUserId: string, lastfmUsername: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM lastfm_loved_matches
     WHERE spotify_user_id = $1 AND lastfm_username = $2
       AND status = 'pending' AND searched_at IS NULL`,
    [spotifyUserId, lastfmUsername],
  );
  return result.rows[0].count as number;
}

export async function countMirrored(spotifyUserId: string, lastfmUsername: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM lastfm_loved_matches
     WHERE spotify_user_id = $1 AND lastfm_username = $2`,
    [spotifyUserId, lastfmUsername],
  );
  return result.rows[0].count as number;
}

export async function lastScanAt(spotifyUserId: string): Promise<Date | null> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT MAX(searched_at) AS last FROM lastfm_loved_matches WHERE spotify_user_id = $1',
    [spotifyUserId],
  );
  return (result.rows[0].last as Date | null) ?? null;
}
