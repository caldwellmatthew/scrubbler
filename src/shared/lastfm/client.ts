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

export async function scrobble(items: ScrobbleItem[], sessionKey: string): Promise<void> {
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
}
