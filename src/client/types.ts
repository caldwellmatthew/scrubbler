export interface Track {
  name: string;
  artistName: string;
  albumName: string;
  durationMs: number;
  spotifyTrackId: string;
}

export interface HistoryItem {
  id: string;
  playedAt: string;
  scrobbledAt: string | null;
  track: Track;
}

export interface NowPlayingData {
  isPlaying: boolean;
  sanitizeNowPlaying?: boolean;
  track: {
    name: string;
    artistName: string;
    albumName: string;
    cleanedName: string;
    cleanedAlbumName: string;
    durationMs: number;
    imageUrl: string | null;
    externalUrl: string;
  } | null;
}

export interface PreviewItem {
  id: string;
  playedAt: string;
  artist: string;
  track: string;
  album: string;
  originalTrack: string;
  originalAlbum: string;
}

export interface AuthStatus {
  authenticated: boolean;
  spotifyUserId?: string;
  displayName?: string;
}

export interface PollState {
  pollEnabled: boolean;
  lastPolledAt: string | null;
}

export interface LastfmStatus {
  enabled: boolean;
  connected: boolean;
  username?: string;
}

export interface ToggleState {
  enabled: boolean;
}
