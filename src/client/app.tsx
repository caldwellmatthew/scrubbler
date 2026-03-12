import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import * as api from './api';
import { ApiError } from './api';
import type { PollState, LastfmStatus, NowPlayingData, HistoryItem } from './types';
import { useInterval } from './hooks/useInterval';
import { Header } from './components/Header';
import { NowPlaying } from './components/NowPlaying';
import { HistoryTab } from './components/HistoryTab';
import { ExplorerTab } from './components/ExplorerTab';
import { ScrobblePreviewModal } from './components/ScrobblePreviewModal';

const LIMIT = 50;

export function App() {
  // Auth state
  const [authenticated, setAuthenticated] = useState(false);
  const [displayName, setDisplayName] = useState('');

  // Poll state
  const [pollState, setPollState] = useState<PollState | null>(null);

  // Last.fm state
  const [lastfmStatus, setLastfmStatus] = useState<LastfmStatus | null>(null);
  const [autoScrobbleEnabled, setAutoScrobbleEnabled] = useState(false);
  const [sanitizeScrobble, setSanitizeScrobble] = useState(true);
  const [nowPlayingEnabled, setNowPlayingEnabled] = useState(false);
  const [sanitizeNowPlaying, setSanitizeNowPlaying] = useState(true);

  // Now playing
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const currentTrackName = useRef<string | null>(null);

  // History
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scrobbledIds, setScrobbledIds] = useState<Set<string>>(new Set());

  // Tabs
  const [activeTab, setActiveTab] = useState<'history' | 'explorer'>('history');

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIds, setPreviewIds] = useState<string[]>([]);

  // Connection error
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const lastfmEnabled = lastfmStatus?.enabled ?? false;
  const lastfmConnected = lastfmStatus?.connected ?? false;

  // -- Refresh functions --

  /** Run an async fn, clearing or setting connectionError based on result. */
  function withConnectionTracking<T>(fn: () => Promise<T>): Promise<T | undefined> {
    return fn().then((result) => {
      setConnectionError(null);
      return result;
    }).catch((err) => {
      if (err instanceof ApiError && err.status === 503) {
        setConnectionError('Server is having trouble reaching the database.');
      } else if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setConnectionError('Cannot reach the server.');
      } else {
        setConnectionError(null);
        throw err;
      }
      return undefined;
    });
  }

  const refreshPollState = useCallback(async () => {
    if (!authenticated) return;
    const result = await withConnectionTracking(() => api.getPollState());
    if (result) setPollState(result);
  }, [authenticated]);

  const refreshLastfmState = useCallback(async () => {
    const status = await withConnectionTracking(() => api.getLastfmStatus());
    if (!status) return;
    setLastfmStatus(status);
    if (!status.enabled) return;
    if (status.connected) {
      const [as, ss, npe, snp] = await Promise.all([
        api.getAutoScrobble(),
        api.getSanitizeScrobble(),
        api.getNowPlayingEnabled(),
        api.getSanitizeNowPlaying(),
      ]);
      setAutoScrobbleEnabled(as.enabled);
      setSanitizeScrobble(ss.enabled);
      setNowPlayingEnabled(npe.enabled);
      setSanitizeNowPlaying(snp.enabled);
    } else {
      setAutoScrobbleEnabled(false);
      setSanitizeScrobble(true);
      setNowPlayingEnabled(false);
      setSanitizeNowPlaying(true);
    }
  }, []);

  const refreshNowPlaying = useCallback(async () => {
    if (!authenticated) return;
    const data = await withConnectionTracking(() => api.getNowPlaying());
    if (!data) return;
    setNowPlaying(data);
    if (data.isPlaying && data.track) {
      if (nowPlayingEnabled && data.track.name !== currentTrackName.current) {
        api.pushNowPlaying().catch(() => {});
      }
      currentTrackName.current = data.track.name;
    } else {
      currentTrackName.current = null;
    }
  }, [authenticated, nowPlayingEnabled]);

  const loadHistory = useCallback(async (reset: boolean) => {
    if (!authenticated) return;
    const newOffset = reset ? 0 : historyOffset;
    const data = await withConnectionTracking(() => api.getHistory(LIMIT, newOffset));
    if (!data) return;
    if (reset) {
      setHistoryItems(data.items);
      setSelectedIds(new Set());
      setScrobbledIds(new Set());
    } else {
      setHistoryItems((prev) => [...prev, ...data.items]);
    }
    setHistoryOffset(newOffset + data.items.length);
    setHasMore(data.items.length >= LIMIT);
  }, [authenticated, historyOffset]);

  // -- Init --

  useEffect(() => {
    async function init() {
      const ott = new URLSearchParams(window.location.search).get('ott');
      if (ott) {
        try { await fetch(`/auth/finalize?ott=${ott}`); } catch { /* server down */ }
        window.history.replaceState({}, '', '/');
      }
      const status = await withConnectionTracking(() => api.getAuthStatus());
      if (!status) return;
      setAuthenticated(status.authenticated);
      setDisplayName(status.displayName || status.spotifyUserId || '');
      if (!status.authenticated) return;
      await Promise.all([
        withConnectionTracking(() => api.getPollState()).then(r => { if (r) setPollState(r); }),
        refreshLastfmState(),
        withConnectionTracking(() => api.getNowPlaying()).then(data => {
          if (!data) return;
          setNowPlaying(data);
          if (data.isPlaying && data.track) currentTrackName.current = data.track.name;
        }),
      ]);
      const histData = await withConnectionTracking(() => api.getHistory(LIMIT, 0));
      if (!histData) return;
      setHistoryItems(histData.items);
      setHistoryOffset(histData.items.length);
      setHasMore(histData.items.length >= LIMIT);
    }
    init();
  }, []);

  // -- Timers --

  useInterval(refreshPollState, authenticated ? 30_000 : null);
  useInterval(refreshNowPlaying, authenticated ? 30_000 : null);
  useInterval(
    () => { if (selectedIds.size === 0) loadHistory(true); },
    authenticated ? 60_000 : null,
  );

  // -- Handlers --

  async function handleTogglePoll() {
    try {
      const action = pollState?.pollEnabled ? 'stop' : 'start';
      await api.togglePoll(action);
      await refreshPollState();
    } catch { setConnectionError('Failed to toggle polling.'); }
  }

  async function handleLogout() {
    try {
      await api.logout();
      setAuthenticated(false);
      setDisplayName('');
      setHistoryItems([]);
      setHistoryOffset(0);
    } catch { setConnectionError('Failed to log out.'); }
  }

  async function handleToggleAutoScrobble() {
    try {
      await api.setAutoScrobble(!autoScrobbleEnabled);
      await refreshLastfmState();
    } catch { setConnectionError('Failed to update auto-scrobble setting.'); }
  }

  async function handleToggleSanitizeScrobble() {
    try {
      await api.setSanitizeScrobble(!sanitizeScrobble);
      await refreshLastfmState();
    } catch { setConnectionError('Failed to update sanitize setting.'); }
  }

  async function handleToggleNowPlaying() {
    try {
      await api.setNowPlayingEnabled(!nowPlayingEnabled);
      await refreshLastfmState();
      await refreshNowPlaying();
    } catch { setConnectionError('Failed to update now-playing setting.'); }
  }

  async function handleToggleSanitizeNowPlaying() {
    try {
      await api.setSanitizeNowPlaying(!sanitizeNowPlaying);
      await refreshLastfmState();
      await refreshNowPlaying();
    } catch { setConnectionError('Failed to update sanitize setting.'); }
  }

  async function handleDisconnectLastfm() {
    try {
      await api.disconnectLastfm();
      await refreshLastfmState();
    } catch { setConnectionError('Failed to disconnect Last.fm.'); }
  }

  function handleScrobble(ids: string[]) {
    setPreviewIds(ids);
    setPreviewOpen(true);
  }

  function handleScrobbled(ids: string[]) {
    setScrobbledIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    setSelectedIds(new Set());
  }

  return (
    <>
      {connectionError && (
        <div id="connection-error">
          {connectionError}
          <button onClick={() => setConnectionError(null)}>Dismiss</button>
        </div>
      )}
      <Header
        authenticated={authenticated}
        connectionError={!!connectionError}
        displayName={displayName}
        pollState={pollState}
        lastfmStatus={lastfmStatus}
        autoScrobbleEnabled={autoScrobbleEnabled}
        sanitizeScrobble={sanitizeScrobble}
        onTogglePoll={handleTogglePoll}
        onLogout={handleLogout}
        onToggleAutoScrobble={handleToggleAutoScrobble}
        onToggleSanitizeScrobble={handleToggleSanitizeScrobble}
        onDisconnectLastfm={handleDisconnectLastfm}
      />

      {!authenticated ? (
        <div id="unauthenticated">
          {connectionError ? (
            <p>Unable to connect to the server. Please try again later.</p>
          ) : (
            <>
              <p>Connect your Spotify account to start caching your listening history.</p>
              <a href="/auth/login">Connect Spotify</a>
            </>
          )}
        </div>
      ) : (
        <div class={connectionError ? 'app-disabled' : ''}>
          <NowPlaying
            data={nowPlaying}
            lastfmConnected={lastfmConnected}
            nowPlayingEnabled={nowPlayingEnabled}
            sanitizeNowPlaying={sanitizeNowPlaying}
            onToggleNowPlaying={handleToggleNowPlaying}
            onToggleSanitize={handleToggleSanitizeNowPlaying}
          />
          <div class="tabs">
            <button
              class={`tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              History
            </button>
            <button
              class={`tab ${activeTab === 'explorer' ? 'active' : ''}`}
              onClick={() => setActiveTab('explorer')}
            >
              API Explorer
            </button>
          </div>

          {activeTab === 'history' ? (
            <HistoryTab
              items={historyItems}
              selectedIds={selectedIds}
              lastfmEnabled={lastfmEnabled}
              lastfmConnected={lastfmConnected}
              hasMore={hasMore}
              onSelectionChange={setSelectedIds}
              onLoadMore={() => loadHistory(false)}
              onScrobble={handleScrobble}
              scrobbledIds={scrobbledIds}
            />
          ) : (
            <ExplorerTab />
          )}

          <ScrobblePreviewModal
            ids={previewIds}
            open={previewOpen}
            rescrobbleCount={previewIds.filter((id) => {
              const item = historyItems.find((i) => i.id === id);
              return item && (!!item.scrobbledAt || scrobbledIds.has(id));
            }).length}
            onClose={() => setPreviewOpen(false)}
            onScrobbled={handleScrobbled}
          />
        </div>
      )}
    </>
  );
}
