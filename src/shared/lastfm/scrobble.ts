import type { ListenHistoryRow } from '../types';
import type { ScrobbleItem } from './client';
import { cleanName } from './clean';
import * as historyRepo from '../repositories/historyRepo';

/**
 * Build ScrobbleItems from history rows, optionally applying sanitization
 * and per-row overrides (from the preview modal).
 */
export function buildScrobbleItems(
  rows: ListenHistoryRow[],
  options: {
    sanitize?: boolean;
    overrides?: Record<string, { track?: string; album?: string }>;
  } = {},
): ScrobbleItem[] {
  const { sanitize = true, overrides } = options;
  return rows.map((row) => ({
    artist: row.artistName.split(', ')[0],
    track: overrides?.[String(row.id)]?.track ?? (sanitize ? cleanName(row.name) : row.name),
    album: overrides?.[String(row.id)]?.album ?? (sanitize ? cleanName(row.albumName) : row.albumName),
    timestamp: Math.floor(row.playedAt.getTime() / 1000),
    duration: Math.floor(row.durationMs / 1000),
  }));
}

/**
 * Mark rows as scrobbled, partitioning by whether the scrobbled values
 * differ from the originals (i.e. were sanitized).
 */
export async function markScrobbledWithSanitizeInfo(
  rows: ListenHistoryRow[],
  items: ScrobbleItem[],
): Promise<void> {
  const sanitizedIds: string[] = [];
  const unsanitizedIds: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const item = items[i];
    if (item.track !== row.name || item.album !== row.albumName) {
      sanitizedIds.push(String(row.id));
    } else {
      unsanitizedIds.push(String(row.id));
    }
  }
  if (sanitizedIds.length > 0) await historyRepo.markScrobbled(sanitizedIds, true);
  if (unsanitizedIds.length > 0) await historyRepo.markScrobbled(unsanitizedIds, false);
}

/**
 * Build a Last.fm now-playing payload from a Spotify track item.
 */
export function buildNowPlayingPayload(
  track: { name: string; artists: { name: string }[]; album: { name: string }; duration_ms: number },
  sanitize: boolean,
): { artist: string; track: string; album: string; duration: number } {
  return {
    artist: track.artists[0].name,
    track: sanitize ? cleanName(track.name) : track.name,
    album: sanitize ? cleanName(track.album.name) : track.album.name,
    duration: Math.floor(track.duration_ms / 1000),
  };
}
