import type { NowPlayingData } from '../types';

interface NowPlayingProps {
  data: NowPlayingData | null;
  lastfmConnected: boolean;
  nowPlayingEnabled: boolean;
  sanitizeNowPlaying: boolean;
  onToggleNowPlaying: () => void;
  onToggleSanitize: () => void;
}

export function NowPlaying({
  data,
  lastfmConnected,
  nowPlayingEnabled,
  sanitizeNowPlaying,
  onToggleNowPlaying,
  onToggleSanitize,
}: NowPlayingProps) {
  const t = data?.isPlaying && data.track ? data.track : null;

  const trackChanged = t ? t.cleanedName !== t.name : false;
  const albumChanged = t ? t.cleanedAlbumName !== t.albumName : false;
  const showCleaned = data?.sanitizeNowPlaying && (trackChanged || albumChanged);

  const cleanedParts: string[] = [];
  if (showCleaned && t) {
    if (trackChanged) cleanedParts.push(`track \u2192 "${t.cleanedName}"`);
    if (albumChanged) cleanedParts.push(`album \u2192 "${t.cleanedAlbumName}"`);
  }

  return (
    <div id="now-playing-bar">
      <div class="np-row" style={{ justifyContent: 'space-between' }}>
        <span class="np-vinyl">Now playing</span>
        {lastfmConnected && (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              id="np-enabled-btn"
              style={{ fontSize: '0.75rem', padding: '0.15rem 0.6rem', borderColor: '#333', color: '#666' }}
              onClick={onToggleNowPlaying}
            >
              Update Last.fm: {nowPlayingEnabled ? 'ON' : 'OFF'}
            </button>
            <button
              id="np-sanitize-btn"
              style={{ fontSize: '0.75rem', padding: '0.15rem 0.6rem', borderColor: '#333', color: '#666' }}
              onClick={onToggleSanitize}
            >
              Sanitize tags: {sanitizeNowPlaying ? 'ON' : 'OFF'}
            </button>
          </div>
        )}
      </div>
      <div class="np-row">
        {t?.imageUrl ? (
          <img src={t.imageUrl} alt="" />
        ) : (
          <img style={{ display: 'none' }} />
        )}
        <div>
          <div class="np-track">{t ? t.name : '\u2014'}</div>
          {t && <div class="np-artist">{t.artistName} · {t.albumName}</div>}
          {showCleaned && (
            <div class="np-cleaned">Sent to Last.fm: {cleanedParts.join(', ')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
