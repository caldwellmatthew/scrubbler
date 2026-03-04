import type { AuthStatus, PollState, LastfmStatus, ToggleState, HistoryItem, NowPlayingData, PreviewItem } from './types';

const json = (r: Response) => r.json();

export function getAuthStatus(): Promise<AuthStatus> {
  return fetch('/auth/status').then(json);
}

export function logout(): Promise<void> {
  return fetch('/auth/logout', { method: 'POST' }).then(() => {});
}

export function getPollState(): Promise<PollState> {
  return fetch('/poll').then(json);
}

export function togglePoll(action: 'start' | 'stop'): Promise<void> {
  return fetch('/poll/' + action, { method: 'POST' }).then(() => {});
}

export function getLastfmStatus(): Promise<LastfmStatus> {
  return fetch('/lastfm/status').then(json);
}

export function getAutoScrobble(): Promise<ToggleState> {
  return fetch('/lastfm/auto-scrobble').then(json);
}

export function setAutoScrobble(enabled: boolean): Promise<void> {
  return fetch('/lastfm/auto-scrobble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }).then(() => {});
}

export function getSanitizeScrobble(): Promise<ToggleState> {
  return fetch('/lastfm/sanitize-scrobble').then(json);
}

export function setSanitizeScrobble(enabled: boolean): Promise<void> {
  return fetch('/lastfm/sanitize-scrobble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }).then(() => {});
}

export function getNowPlayingEnabled(): Promise<ToggleState> {
  return fetch('/lastfm/now-playing-enabled').then(json);
}

export function setNowPlayingEnabled(enabled: boolean): Promise<void> {
  return fetch('/lastfm/now-playing-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }).then(() => {});
}

export function getSanitizeNowPlaying(): Promise<ToggleState> {
  return fetch('/lastfm/sanitize-now-playing').then(json);
}

export function setSanitizeNowPlaying(enabled: boolean): Promise<void> {
  return fetch('/lastfm/sanitize-now-playing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }).then(() => {});
}

export function disconnectLastfm(): Promise<void> {
  return fetch('/lastfm/disconnect', { method: 'POST' }).then(() => {});
}

export function getNowPlaying(): Promise<NowPlayingData> {
  return fetch('/now-playing').then(json);
}

export function pushNowPlaying(): Promise<void> {
  return fetch('/now-playing/push', { method: 'POST' }).then(() => {});
}

export function getHistory(limit: number, offset: number): Promise<{ items: HistoryItem[] }> {
  return fetch(`/history?limit=${limit}&offset=${offset}`).then(json);
}

export function getScrobblePreview(ids: string[]): Promise<{ items: PreviewItem[]; error?: string }> {
  return fetch('/lastfm/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).then(json);
}

export function submitScrobble(ids: string[], overrides: Record<string, { track: string; album: string }>): Promise<{ ok: boolean; error?: string }> {
  return fetch('/lastfm/scrobble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, overrides }),
  }).then(json);
}

export function proxySpotifyRequest(endpoint: string, query?: string): Promise<{ status: number; data: unknown }> {
  const params = new URLSearchParams(query || '');
  params.set('endpoint', endpoint);
  return fetch('/explorer/proxy?' + params.toString()).then(json);
}
