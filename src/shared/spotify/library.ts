import axios, { AxiosError } from 'axios';
import { chunk } from '../batch';
import type { SpotifySearchResponse, SpotifyTrack } from '../types';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const REQUEST_TIMEOUT_MS = 10_000;

// Spotify's library endpoints accept at most 40 URIs per request.
export const LIBRARY_BATCH_SIZE = 40;

// The search endpoint's limit was reduced from 50 to 10 in February 2026.
export const MAX_SEARCH_LIMIT = 10;

const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 30_000;
const DEFAULT_RETRY_WAIT_MS = 1_000;
const RETRY_JITTER_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trackUri(trackId: string): string {
  return `spotify:track:${trackId}`;
}

/** Surface Spotify's own error text when it sends one, since it's specific. */
function errorMessage(err: unknown): string {
  const response = (err as AxiosError<{ error?: { message?: string } }>).response;
  const spotifyMessage = response?.data?.error?.message;
  if (spotifyMessage) return spotifyMessage;
  if (response) return `HTTP ${response.status}`;
  return err instanceof Error ? err.message : String(err);
}

function retryDelayMs(err: AxiosError): number {
  const seconds = Number(err.response?.headers?.['retry-after']);
  const wait = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_WAIT_MS;
  // Jitter so concurrent callers don't all resume on the same tick.
  return Math.min(wait, MAX_RETRY_WAIT_MS) + Math.random() * RETRY_JITTER_MS;
}

/**
 * Retry a request that Spotify rate-limited, honouring Retry-After.
 *
 * Anything other than a 429 propagates immediately — a 403 here usually means
 * the token predates the library scopes and no amount of retrying will fix it.
 */
async function withRateLimitRetry<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request();
    } catch (err) {
      if ((err as AxiosError).response?.status !== 429 || attempt >= MAX_RETRIES) throw err;
      const delay = retryDelayMs(err as AxiosError);
      console.warn(`[spotify] Rate limited — retrying in ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }
}

/**
 * Search the catalog for tracks.
 *
 * Takes a raw access token rather than an OAuthToken because callers fan these
 * out concurrently, and `getValidToken` mutates the token row in place — it
 * must be resolved once, up front, not inside each worker.
 */
export async function searchTracks(
  accessToken: string,
  query: string,
  limit = MAX_SEARCH_LIMIT,
): Promise<SpotifyTrack[]> {
  const response = await withRateLimitRetry(() =>
    axios.get<SpotifySearchResponse>(`${SPOTIFY_API_BASE}/search`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { q: query, type: 'track', limit: Math.min(limit, MAX_SEARCH_LIMIT) },
      timeout: REQUEST_TIMEOUT_MS,
    }),
  );
  return response.data.tracks?.items ?? [];
}

/** Which of these track IDs are already in the user's library. */
export async function checkSaved(accessToken: string, trackIds: string[]): Promise<Map<string, boolean>> {
  const saved = new Map<string, boolean>();

  for (const batch of chunk(trackIds, LIBRARY_BATCH_SIZE)) {
    const response = await withRateLimitRetry(() =>
      axios.get<boolean[]>(`${SPOTIFY_API_BASE}/me/library/contains`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { uris: batch.map(trackUri).join(',') },
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );
    // The response is a bare boolean array in request order.
    batch.forEach((trackId, i) => saved.set(trackId, response.data[i] === true));
  }

  return saved;
}

export interface SaveResult {
  saved: string[];
  failed: Array<{ trackIds: string[]; reason: string }>;
}

/**
 * Add tracks to the user's library, in batches.
 *
 * A failing batch is recorded and the rest still go through, so one bad chunk
 * doesn't discard the user's whole confirmed selection. Saving is idempotent,
 * so a caller retrying a partially-applied set is harmless.
 */
export async function saveTracks(accessToken: string, trackIds: string[]): Promise<SaveResult> {
  const result: SaveResult = { saved: [], failed: [] };

  for (const batch of chunk(trackIds, LIBRARY_BATCH_SIZE)) {
    try {
      await withRateLimitRetry(() =>
        axios.put(`${SPOTIFY_API_BASE}/me/library`, null, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { uris: batch.map(trackUri).join(',') },
          timeout: REQUEST_TIMEOUT_MS,
        }),
      );
      result.saved.push(...batch);
    } catch (err) {
      console.error(`[spotify] Failed to save ${batch.length} track(s):`, errorMessage(err));
      result.failed.push({ trackIds: batch, reason: errorMessage(err) });
    }
  }

  return result;
}
