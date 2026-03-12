import type { AuthStatus, PollState, LastfmStatus, ToggleState, HistoryItem, NowPlayingData, PreviewItem } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function checkResponse(res: Response): Promise<void> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch { /* ignore parse failure */ }
    throw new ApiError(res.status, message);
  }
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  await checkResponse(res);
  return res.json();
}

async function post<T = void>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    ...(body !== undefined ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : {}),
  });
  await checkResponse(res);
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return get('/auth/status');
}

export async function logout(): Promise<void> {
  await post('/auth/logout');
}

export async function getPollState(): Promise<PollState> {
  return get('/poll');
}

export async function togglePoll(action: 'start' | 'stop'): Promise<void> {
  await post('/poll/' + action);
}

export async function getLastfmStatus(): Promise<LastfmStatus> {
  return get('/lastfm/status');
}

export async function getAutoScrobble(): Promise<ToggleState> {
  return get('/lastfm/auto-scrobble');
}

export async function setAutoScrobble(enabled: boolean): Promise<void> {
  await post('/lastfm/auto-scrobble', { enabled });
}

export async function getSanitizeScrobble(): Promise<ToggleState> {
  return get('/lastfm/sanitize-scrobble');
}

export async function setSanitizeScrobble(enabled: boolean): Promise<void> {
  await post('/lastfm/sanitize-scrobble', { enabled });
}

export async function getNowPlayingEnabled(): Promise<ToggleState> {
  return get('/lastfm/now-playing-enabled');
}

export async function setNowPlayingEnabled(enabled: boolean): Promise<void> {
  await post('/lastfm/now-playing-enabled', { enabled });
}

export async function getSanitizeNowPlaying(): Promise<ToggleState> {
  return get('/lastfm/sanitize-now-playing');
}

export async function setSanitizeNowPlaying(enabled: boolean): Promise<void> {
  await post('/lastfm/sanitize-now-playing', { enabled });
}

export async function disconnectLastfm(): Promise<void> {
  await post('/lastfm/disconnect');
}

export async function getNowPlaying(): Promise<NowPlayingData> {
  return get('/now-playing');
}

export async function pushNowPlaying(): Promise<void> {
  await post('/now-playing/push');
}

export async function getHistory(limit: number, offset: number): Promise<{ items: HistoryItem[] }> {
  return get(`/history?limit=${limit}&offset=${offset}`);
}

export async function getScrobblePreview(ids: string[]): Promise<{ items: PreviewItem[]; error?: string }> {
  return post('/lastfm/preview', { ids });
}

export async function submitScrobble(ids: string[], overrides: Record<string, { track: string; album: string }>): Promise<{ ok: boolean; error?: string }> {
  return post('/lastfm/scrobble', { ids, overrides });
}

export async function proxySpotifyRequest(endpoint: string, query?: string): Promise<{ status: number; data: unknown }> {
  const params = new URLSearchParams(query || '');
  params.set('endpoint', endpoint);
  return get('/explorer/proxy?' + params.toString());
}
