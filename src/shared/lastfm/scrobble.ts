import type { ListenHistoryRow, PriorPlay } from '../types';
import type { ScrobbleItem, ScrobbleResult } from './client';
import { cleanName } from './clean';
import * as historyRepo from '../repositories/historyRepo';

export interface DuplicatePlay {
  row: ListenHistoryRow;
  priorPlayedAt: Date;
}

export const DUPLICATE_PLAY_REASON = 'Repeat of an earlier play of the same track';

/**
 * Split plays into those worth scrobbling and those that merely repeat a listen
 * already accounted for.
 *
 * Spotify can log one listen more than once — shortly after it starts and again
 * when it ends — so entries for the same track spaced closer together than that
 * track's own duration describe a single listen rather than several. Such a run
 * should produce exactly one scrobble.
 *
 * The run's *last* entry marks the true end of the listen, but we keep the
 * first: later entries may not exist yet when the earlier one is scrobbled, so
 * anchoring on the first is the only choice available in the polling path. The
 * cost is a timestamp early by up to a track length.
 *
 * A run is only suppressed once something in it has been scrobbled. An earlier
 * play that was never sent to Last.fm cannot stand in for this one, or a real
 * listen would end up with no scrobble at all.
 *
 * `priorPlays` maps a row id to the nearest earlier play of the same track, as
 * returned by historyRepo.getPriorSameTrackPlays.
 */
export function partitionDuplicatePlays(
  rows: ListenHistoryRow[],
  priorPlays: Map<string, PriorPlay>,
): { kept: ListenHistoryRow[]; duplicates: DuplicatePlay[] } {
  const kept: ListenHistoryRow[] = [];
  const duplicates: DuplicatePlay[] = [];
  // Plays decided earlier in this batch, which the stored prior does not know about
  const decidedByTrack = new Map<string, PriorPlay>();

  const chronological = [...rows].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  for (const row of chronological) {
    const stored = priorPlays.get(String(row.id));
    const decided = decidedByTrack.get(row.spotifyTrackId);
    // Whichever prior play is nearer is the one this play could be repeating
    const prior = stored && decided
      ? (stored.playedAt > decided.playedAt ? stored : decided)
      : stored ?? decided;

    const repeatsCoveredListen = prior !== undefined
      && prior.scrobbled
      && row.playedAt.getTime() - prior.playedAt.getTime() < row.durationMs;

    if (repeatsCoveredListen) {
      duplicates.push({ row, priorPlayedAt: prior.playedAt });
    } else {
      kept.push(row);
    }
    // Either way this listen now has a scrobble, so later entries in the run repeat it
    decidedByTrack.set(row.spotifyTrackId, { playedAt: row.playedAt, scrobbled: true });
  }
  return { kept, duplicates };
}

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
    artist: row.artistNames[0],
    track: overrides?.[String(row.id)]?.track ?? (sanitize ? cleanName(row.name) : row.name),
    album: overrides?.[String(row.id)]?.album ?? (sanitize ? cleanName(row.albumName) : row.albumName),
    timestamp: Math.floor(row.playedAt.getTime() / 1000),
    duration: Math.floor(row.durationMs / 1000),
  }));
}

/**
 * Mark rows accepted by Last.fm as scrobbled, partitioning by whether the
 * scrobbled values differ from the originals (i.e. were sanitized). Rows
 * whose scrobbles were ignored are left unscrobbled.
 */
export async function markScrobbledWithSanitizeInfo(
  rows: ListenHistoryRow[],
  items: ScrobbleItem[],
  results: ScrobbleResult[],
): Promise<void> {
  const sanitizedIds: string[] = [];
  const unsanitizedIds: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (!results[i]?.accepted) continue;
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
