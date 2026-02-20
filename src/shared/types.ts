// ─── Domain types ────────────────────────────────────────────────────────────

export interface OAuthToken {
  id: number;
  spotifyUserId: string;
  displayName: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Track {
  spotifyTrackId: string;
  name: string;
  artistName: string;
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
  id: number;
  name: string;
  artistName: string;
  albumName: string;
  durationMs: number;
  externalUrl: string | null;
  previewUrl: string | null;
  imageUrl: string | null;
}

export interface PollState {
  id: 1;
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
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
  external_urls: { spotify: string };
  preview_url: string | null;
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
