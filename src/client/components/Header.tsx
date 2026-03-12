import type { PollState, LastfmStatus } from '../types';

interface HeaderProps {
  authenticated: boolean;
  connectionError: boolean;
  displayName: string;
  pollState: PollState | null;
  lastfmStatus: LastfmStatus | null;
  autoScrobbleEnabled: boolean;
  sanitizeScrobble: boolean;
  onTogglePoll: () => void;
  onLogout: () => void;
  onToggleAutoScrobble: () => void;
  onToggleSanitizeScrobble: () => void;
  onDisconnectLastfm: () => void;
}

export function Header({
  authenticated,
  connectionError,
  displayName,
  pollState,
  lastfmStatus,
  autoScrobbleEnabled,
  sanitizeScrobble,
  onTogglePoll,
  onLogout,
  onToggleAutoScrobble,
  onToggleSanitizeScrobble,
  onDisconnectLastfm,
}: HeaderProps) {
  const polling = pollState?.pollEnabled ?? false;

  return (
    <header>
      <h1>Scrubbler</h1>
      {authenticated && (
        <>
          <span class={`pill ${polling ? 'on' : 'off'}`}>
            {polling ? 'Polling' : 'Stopped'}
          </span>
          <button onClick={onTogglePoll} disabled={connectionError}>
            {polling ? 'Stop polling' : 'Start polling'}
          </button>
          <span class="meta">
            {pollState?.lastPolledAt
              ? 'Last polled ' + new Date(pollState.lastPolledAt).toLocaleString()
              : ''}
          </span>
        </>
      )}
      <span class="spacer"></span>
      {lastfmStatus?.enabled && (
        <div class="header-group">
          <span class="group-label">Last.fm</span>
          {lastfmStatus.connected ? (
            <>
              <span class="meta">{lastfmStatus.username}</span>
              <button onClick={onToggleAutoScrobble} disabled={connectionError}>
                Auto-scrobble: {autoScrobbleEnabled ? 'ON' : 'OFF'}
              </button>
              <button onClick={onToggleSanitizeScrobble} disabled={connectionError}>
                Sanitize tags: {sanitizeScrobble ? 'ON' : 'OFF'}
              </button>
              <button id="lastfm-disconnect-btn" onClick={onDisconnectLastfm} disabled={connectionError}>
                Disconnect Last.fm
              </button>
            </>
          ) : (
            <a href="/lastfm/login" id="lastfm-connect-btn" class="btn">
              Connect Last.fm
            </a>
          )}
        </div>
      )}
      {(authenticated || !connectionError) && (
        <div class="header-group">
          <span class="group-label">Spotify</span>
          {authenticated ? (
            <>
              <span class="user-id">{displayName}</span>
              <button id="logout-btn" onClick={onLogout}>Log out</button>
            </>
          ) : (
            <a href="/auth/login" id="login-btn" class="btn">Connect Spotify</a>
          )}
        </div>
      )}
    </header>
  );
}
