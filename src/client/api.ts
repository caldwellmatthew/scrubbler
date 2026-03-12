import type { AuthStatus, PollState, LastfmStatus, ToggleState, HistoryItem, NowPlayingData, PreviewItem } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch { /* ignore parse failure */ }
    throw new ApiError(res.status, message);
  }
  return res.json();
}

function post(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    ...(body !== undefined ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : {}),
  });
}

export function getAuthStatus(): Promise<AuthStatus> {
  return fetch('/auth/status').then(r => parseResponse(r));
}

export function logout(): Promise<void> {
  return post('/auth/logout').then(r => { if (!r.ok) throw new ApiError(r.status, 'Logout failed'); });
}

export function getPollState(): Promise<PollState> {
  return fetch('/poll').then(r => parseResponse(r));
}

export function togglePoll(action: 'start' | 'stop'): Promise<void> {
  return post('/poll/' + action).then(r => { if (!r.ok) throw new ApiError(r.status, 'Toggle poll failed'); });
}

export function getLastfmStatus(): Promise<LastfmStatus> {
  return fetch('/lastfm/status').then(r => parseResponse(r));
}

export function getAutoScrobble(): Promise<ToggleState> {
  return fetch('/lastfm/auto-scrobble').then(r => parseResponse(r));
}

export function setAutoScrobble(enabled: boolean): Promise<void> {
  return post('/lastfm/auto-scrobble', { enabled }).then(r => { if (!r.ok) throw new ApiError(r.status, 'Failed'); });
}

export function getSanitizeScrobble(): Promise<ToggleState> {
  return fetch('/lastfm/sanitize-scrobble').then(r => parseResponse(r));
}

export function setSanitizeScrobble(enabled: boolean): Promise<void> {
  return post('/lastfm/sanitize-scrobble', { enabled }).then(r => { if (!r.ok) throw new ApiError(r.status, 'Failed'); });
}

export function getNowPlayingEnabled(): Promise<ToggleState> {
  return fetch('/lastfm/now-playing-enabled').then(r => parseResponse(r));
}

export function setNowPlayingEnabled(enabled: boolean): Promise<void> {
  return post('/lastfm/now-playing-enabled', { enabled }).then(r => { if (!r.ok) throw new ApiError(r.status, 'Failed'); });
}

export function getSanitizeNowPlaying(): Promise<ToggleState> {
  return fetch('/lastfm/sanitize-now-playing').then(r => parseResponse(r));
}

export function setSanitizeNowPlaying(enabled: boolean): Promise<void> {
  return post('/lastfm/sanitize-now-playing', { enabled }).then(r => { if (!r.ok) throw new ApiError(r.status, 'Failed'); });
}

export function disconnectLastfm(): Promise<void> {
  return post('/lastfm/disconnect').then(r => { if (!r.ok) throw new ApiError(r.status, 'Disconnect failed'); });
}

export function getNowPlaying(): Promise<NowPlayingData> {
  return fetch('/now-playing').then(r => parseResponse(r));
}

export function pushNowPlaying(): Promise<void> {
  return post('/now-playing/push').then(r => { if (!r.ok) throw new ApiError(r.status, 'Push failed'); });
}

export function getHistory(limit: number, offset: number): Promise<{ items: HistoryItem[] }> {
  return fetch(`/history?limit=${limit}&offset=${offset}`).then(r => parseResponse(r));
}

export function getScrobblePreview(ids: string[]): Promise<{ items: PreviewItem[]; error?: string }> {
  return post('/lastfm/preview', { ids }).then(r => parseResponse(r));
}

export function submitScrobble(ids: string[], overrides: Record<string, { track: string; album: string }>): Promise<{ ok: boolean; error?: string }> {
  return post('/lastfm/scrobble', { ids, overrides }).then(r => parseResponse(r));
}

export function proxySpotifyRequest(endpoint: string, query?: string): Promise<{ status: number; data: unknown }> {
  const params = new URLSearchParams(query || '');
  params.set('endpoint', endpoint);
  return fetch('/explorer/proxy?' + params.toString()).then(r => parseResponse(r));
}
