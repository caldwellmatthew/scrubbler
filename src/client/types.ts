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
  scrobbleSanitized: boolean | null;
  /** Why this play was deliberately not sent to Last.fm; null if it never was. */
  scrobbleSkippedReason: string | null;
  track: Track;
}

export interface NowPlayingData {
  isPlaying: boolean;
  sanitizeNowPlaying?: boolean;
  error?: string;
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

export interface LikedSyncCounts {
  pending: number;
  synced: number;
  already_liked: number;
  rejected: number;
  no_match: number;
}

export interface LikedSyncStatus {
  lastfmEnabled: boolean;
  lastfmConnected: boolean;
  lastfmUsername: string | null;
  spotifyScopesOk: boolean;
  missingScopes: string[];
  counts: LikedSyncCounts;
  unsearched: number;
  totalMirrored: number;
  lastScanAt: string | null;
}

export interface LikedSyncMatch {
  spotifyTrackId: string;
  name: string;
  artistName: string;
  albumName: string;
  imageUrl: string | null;
  externalUrl: string | null;
  durationMs: number | null;
}

export interface LikedSyncAlternate {
  spotifyTrackId: string;
  name: string;
  artistName: string;
  albumName: string;
  score: number;
}

export interface LikedSyncItem {
  id: string;
  lastfmArtist: string;
  lastfmTrack: string;
  lovedAt: string | null;
  status: string;
  confidence: 'high' | 'medium' | 'low' | null;
  score: number | null;
  alreadyLiked: boolean;
  match: LikedSyncMatch | null;
  alternates: LikedSyncAlternate[];
  // Set locally when the user picks an alternate version; not sent by the API.
  chosenTrackId?: string;
}
