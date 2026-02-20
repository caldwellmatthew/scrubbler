import { getPool } from '../db';
import type { Track } from '../types';

export async function upsertMany(tracks: Track[]): Promise<void> {
  if (tracks.length === 0) return;

  const pool = getPool();

  // Deduplicate by track ID — the same track can appear multiple times in a
  // recently-played response, and Postgres rejects an ON CONFLICT DO UPDATE
  // that would touch the same row twice within one statement.
  const seen = new Set<string>();
  const unique = tracks.filter((t) => {
    if (seen.has(t.spotifyTrackId)) return false;
    seen.add(t.spotifyTrackId);
    return true;
  });

  // Build a multi-row upsert
  const values: unknown[] = [];
  const placeholders = unique.map((track, i) => {
    const base = i * 8;
    values.push(
      track.spotifyTrackId,
      track.name,
      track.artistName,
      track.albumName,
      track.durationMs,
      track.externalUrl,
      track.previewUrl,
      track.imageUrl,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, NOW())`;
  });

  await pool.query(
    `INSERT INTO tracks (spotify_track_id, name, artist_name, album_name, duration_ms, external_url, preview_url, image_url, updated_at)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (spotify_track_id) DO UPDATE SET
       name         = EXCLUDED.name,
       artist_name  = EXCLUDED.artist_name,
       album_name   = EXCLUDED.album_name,
       duration_ms  = EXCLUDED.duration_ms,
       external_url = EXCLUDED.external_url,
       preview_url  = EXCLUDED.preview_url,
       image_url    = EXCLUDED.image_url,
       updated_at   = NOW()`,
    values,
  );
}
