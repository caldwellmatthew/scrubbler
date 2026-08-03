// ─── Domain types ────────────────────────────────────────────────────────────

export interface OAuthToken {
  id: number;
  spotifyUserId: string;
  displayName: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null; // null for grants recorded before scopes were tracked
  createdAt: Date;
  updatedAt: Date;
}

export interface Track {
  spotifyTrackId: string;
  name: string;
  artistNames: string[]; // ordered, primary artist first
  albumName: string;
  durationMs: number;
  externalUrl: string | null;
  previewUrl: string | null;
  imageUrl: string | null;
  updatedAt: Date;
}

export interface ListenEvent {
  spotifyTrackId: string;
  spotifyUserId: string;
  playedAt: Date;
}

export interface ListenHistoryRow extends ListenEvent {
  id: string;
  name: string;
  artistNames: string[]; // ordered, primary artist first
  albumName: string;
  durationMs: number;
  externalUrl: string | null;
  previewUrl: string | null;
  imageUrl: string | null;
  scrobbledAt: Date | null;
  scrobbleSanitized: boolean | null;
  /** Why this play was deliberately not sent to Last.fm; null if it never was. */
  scrobbleSkippedReason: string | null;
}

/** The play immediately preceding another play of the same track. */
export interface PriorPlay {
  playedAt: Date;
  /**
   * Whether this play's listen is already accounted for — scrobbled, or
   * skipped because something earlier in the same run was.
   */
  covered: boolean;
}

export interface LastfmSession {
  id: number;
  username: string;
  sessionKey: string;
  createdAt: Date;
  autoScrobbleEnabled: boolean;
  sanitizeScrobble: boolean;
  sanitizeNowPlaying: boolean;
  nowPlayingEnabled: boolean;
}

// 'synced' means we saved it; 'already_liked' means it was in the library
// before we got there. 'no_match' is soft-terminal — skipped by default, but
// revisited on an explicit retry, since the catalog and the matcher both change.
export type LovedMatchStatus = 'pending' | 'synced' | 'already_liked' | 'rejected' | 'no_match';

export interface LovedMatchCandidate {
  spotifyTrackId: string;
  name: string;
  artistNames: string[];
  albumName: string;
  score: number;
}

/** A Spotify track resolved for a loved track, ready to persist. */
export interface ResolvedMatch {
  spotifyTrackId: string;
  name: string;
  artistNames: string[];
  albumName: string;
  imageUrl: string | null;
  externalUrl: string | null;
  durationMs: number;
  score: number;
  candidates: LovedMatchCandidate[];
}

export interface LovedMatchRow {
  id: string;
  spotifyUserId: string;
  lastfmUsername: string;
  lastfmArtist: string;
  lastfmTrack: string;
  lovedAt: Date | null;
  status: LovedMatchStatus;
  spotifyTrackId: string | null;
  spotifyTrackName: string | null;
  spotifyArtistNames: string[] | null;
  spotifyAlbumName: string | null;
  spotifyImageUrl: string | null;
  spotifyExternalUrl: string | null;
  spotifyDurationMs: number | null;
  matchScore: number | null;
  candidates: LovedMatchCandidate[];
  searchedAt: Date | null;
  syncedAt: Date | null;
}

export interface PollState {
  spotifyUserId: string;
  lastPlayedAtMs: number | null;
  lastPolledAt: Date | null;
  pollEnabled: boolean;
}

// ─── Spotify API response types ───────────────────────────────────────────────

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
  external_urls: { spotify: string };
  preview_url: string | null;
}

export interface SpotifySearchResponse {
  tracks?: {
    items: SpotifyTrack[];
    total: number;
  };
}

export interface SpotifyPlayHistoryItem {
  track: SpotifyTrack;
  played_at: string; // ISO 8601
}

export interface SpotifyRecentlyPlayedResponse {
  items: SpotifyPlayHistoryItem[];
  next: string | null;
  cursors?: {
    after: string;
    before: string;
  };
  limit: number;
  href: string;
}

export interface SpotifyCurrentlyPlayingResponse {
  is_playing: boolean;
  item: SpotifyTrack | null;
}

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string | null;
  email?: string;
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface HistoryQueryParams {
  limit?: number;
  offset?: number;
  before?: string;
  after?: string;
  track_id?: string;
}
