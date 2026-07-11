import axios from 'axios';
import { config } from '../config';
import { buildSig } from './utils';

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const REQUEST_TIMEOUT_MS = 10_000;

export interface ScrobbleItem {
  artist: string;
  track: string;
  album: string;
  timestamp: number; // unix seconds
  duration: number; // seconds
}

export interface ScrobbleResult {
  accepted: boolean;
  ignoredReason: string | null;
}

// Per https://www.last.fm/api/show/track.scrobble; the response's own
// ignoredMessage text is often empty, so map codes to readable reasons.
const IGNORED_REASONS: Record<string, string> = {
  '1': 'Artist was ignored by Last.fm',
  '2': 'Track was ignored by Last.fm',
  '3': 'Timestamp too old',
  '4': 'Timestamp too new',
  '5': 'Daily scrobble limit exceeded',
};

/**
 * Parse a track.scrobble response body into per-item results, in submission
 * order. Last.fm reports ignored scrobbles inside an HTTP 200 response, so
 * "no error field" does not mean "accepted".
 */
export function parseScrobbleResults(data: unknown, itemCount: number): ScrobbleResult[] {
  const scrobbles = (data as { scrobbles?: { scrobble?: unknown } })?.scrobbles?.scrobble;
  // Single-item responses come back as a bare object rather than an array
  const entries = Array.isArray(scrobbles) ? scrobbles : scrobbles !== undefined ? [scrobbles] : [];
  if (entries.length !== itemCount) {
    console.warn(
      `[lastfm] Unexpected scrobble response shape (${entries.length} entries for ${itemCount} items) — assuming all accepted`,
    );
    return Array.from({ length: itemCount }, () => ({ accepted: true, ignoredReason: null }));
  }
  return entries.map((entry) => {
    const msg = (entry as { ignoredMessage?: { code?: string; '#text'?: string } })?.ignoredMessage;
    const code = String(msg?.code ?? '0');
    if (code === '0') return { accepted: true, ignoredReason: null };
    const reason = msg?.['#text'] || IGNORED_REASONS[code] || `Ignored by Last.fm (code ${code})`;
    return { accepted: false, ignoredReason: reason };
  });
}

export async function scrobble(items: ScrobbleItem[], sessionKey: string): Promise<ScrobbleResult[]> {
  const params: Record<string, string> = {
    method: 'track.scrobble',
    api_key: config.lastfmApiKey,
    sk: sessionKey,
  };

  items.forEach((item, i) => {
    params[`artist[${i}]`] = item.artist;
    params[`track[${i}]`] = item.track;
    params[`album[${i}]`] = item.album;
    params[`timestamp[${i}]`] = String(item.timestamp);
    params[`duration[${i}]`] = String(item.duration);
  });

  const api_sig = buildSig(params, config.lastfmApiSecret);
  const body = new URLSearchParams({ ...params, api_sig, format: 'json' });

  const res = await axios.post(LASTFM_API_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (res.data.error) {
    throw new Error(`Last.fm scrobble error ${res.data.error}: ${res.data.message}`);
  }

  return parseScrobbleResults(res.data, items.length);
}

export interface NowPlayingItem {
  artist: string;
  track: string;
  album: string;
  duration: number; // seconds
}

export async function updateNowPlaying(item: NowPlayingItem, sessionKey: string): Promise<void> {
  const params: Record<string, string> = {
    method: 'track.updateNowPlaying',
    api_key: config.lastfmApiKey,
    sk: sessionKey,
    artist: item.artist,
    track: item.track,
    album: item.album,
    duration: String(item.duration),
  };
  const api_sig = buildSig(params, config.lastfmApiSecret);
  const body = new URLSearchParams({ ...params, api_sig, format: 'json' });
  const res = await axios.post(LASTFM_API_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: REQUEST_TIMEOUT_MS,
  });
  if (res.data.error) {
    throw new Error(`Last.fm nowplaying error ${res.data.error}: ${res.data.message}`);
  }
}
