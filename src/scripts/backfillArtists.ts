/**
 * Refetch multi-artist tracks from the Spotify API and correct their
 * artist_names arrays.
 *
 * The migration that introduced artist_names backfilled it by splitting the
 * legacy comma-joined string, which mis-splits artist names that themselves
 * contain ", " (e.g. "Tyler, The Creator"). Single-element rows are
 * unambiguous, so only multi-element rows are verified. Safe to re-run.
 */
import * as tokenRepo from '../shared/repositories/tokenRepo';
import { fetchTracks, FETCH_TRACKS_MAX_IDS } from '../shared/spotify/client';
import { getPool, closePool, dbErrorMessage } from '../shared/db';

async function main(): Promise<void> {
  const pool = getPool();

  const tokens = await tokenRepo.getAll();
  if (tokens.length === 0) {
    throw new Error('No Spotify OAuth tokens in the database — authenticate via /auth/login first');
  }
  const token = tokens[0];

  const result = await pool.query(
    'SELECT spotify_track_id FROM tracks WHERE array_length(artist_names, 1) > 1 ORDER BY spotify_track_id',
  );
  const ids = result.rows.map((row) => row.spotify_track_id as string);
  console.log(`[backfill] ${ids.length} multi-artist tracks to verify against Spotify`);

  let corrected = 0;
  let missing = 0;
  for (let i = 0; i < ids.length; i += FETCH_TRACKS_MAX_IDS) {
    const batch = ids.slice(i, i + FETCH_TRACKS_MAX_IDS);
    const tracks = await fetchTracks(token, batch);
    for (let j = 0; j < batch.length; j++) {
      const track = tracks[j];
      if (!track) {
        missing++;
        console.warn(`[backfill] Track ${batch[j]} not found on Spotify — keeping split-based names`);
        continue;
      }
      const names = track.artists.map((a) => a.name);
      const update = await pool.query(
        `UPDATE tracks SET artist_names = $2, updated_at = NOW()
         WHERE spotify_track_id = $1 AND artist_names IS DISTINCT FROM $2`,
        [batch[j], names],
      );
      corrected += update.rowCount ?? 0;
    }
    console.log(`[backfill] Checked ${Math.min(i + FETCH_TRACKS_MAX_IDS, ids.length)}/${ids.length}`);
  }

  console.log(
    `[backfill] Done: ${corrected} corrected, ${ids.length - corrected - missing} already correct, ${missing} not found`,
  );
}

main()
  .catch((err) => {
    console.error(`[backfill] Failed: ${dbErrorMessage(err)}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
