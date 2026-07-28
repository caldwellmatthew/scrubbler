import axios from 'axios';
import { config } from '../config';

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const REQUEST_TIMEOUT_MS = 10_000;

export interface LovedTrack {
  artist: string;
  track: string;
  lovedAt: Date | null;
}

export interface LovedTracksPage {
  tracks: LovedTrack[];
  total: number;
  totalPages: number;
  page: number;
}

function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse a user.getLovedTracks response body.
 *
 * Last.fm returns every number as a string, and — as with track.scrobble —
 * collapses a single-element list into a bare object rather than an array.
 */
export function parseLovedTracksResponse(data: unknown): LovedTracksPage {
  const loved = (data as { lovedtracks?: Record<string, unknown> })?.lovedtracks;
  const raw = loved?.track;
  const entries = Array.isArray(raw) ? raw : raw !== undefined && raw !== null ? [raw] : [];

  const attr = (loved?.['@attr'] ?? {}) as Record<string, unknown>;

  const tracks = entries.flatMap((entry) => {
    const e = entry as {
      name?: string;
      artist?: { name?: string };
      date?: { uts?: string };
    };
    const track = e?.name;
    const artist = e?.artist?.name;
    // Both names are required to search for anything; skip malformed entries
    // rather than mirroring a row that can never resolve.
    if (!track || !artist) return [];

    const uts = e.date?.uts;
    const utsSeconds = uts === undefined ? NaN : Number(uts);
    return [{
      artist,
      track,
      lovedAt: Number.isFinite(utsSeconds) ? new Date(utsSeconds * 1000) : null,
    }];
  });

  return {
    tracks,
    total: toInt(attr.total, tracks.length),
    totalPages: toInt(attr.totalPages, 1),
    page: toInt(attr.page, 1),
  };
}

/**
 * Fetch one page of a user's loved tracks, newest first. Read-only and
 * unauthenticated — it needs only the API key and a username.
 */
export async function fetchLovedTracks(
  username: string,
  page: number,
  limit: number,
): Promise<LovedTracksPage> {
  const res = await axios.get(LASTFM_API_URL, {
    params: {
      method: 'user.getLovedTracks',
      user: username,
      api_key: config.lastfmApiKey,
      limit,
      page,
      format: 'json',
    },
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (res.data.error) {
    throw new Error(`Last.fm getLovedTracks error ${res.data.error}: ${res.data.message}`);
  }
  return parseLovedTracksResponse(res.data);
}
