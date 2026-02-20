import axios from 'axios';
import { refreshAccessToken } from './auth';
import * as tokenRepo from '../repositories/tokenRepo';
import type { OAuthToken } from '../types';
import type { SpotifyRecentlyPlayedResponse, SpotifyUserProfile } from '../types';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const REFRESH_BUFFER_MS = 60 * 1000; // refresh if within 60 seconds of expiry
const REQUEST_TIMEOUT_MS = 10_000;

async function getValidToken(token: OAuthToken): Promise<string> {
  const now = Date.now();
  const expiresAt = token.expiresAt.getTime();

  if (expiresAt - now > REFRESH_BUFFER_MS) {
    return token.accessToken;
  }

  console.log(`[client] Access token for ${token.spotifyUserId} expiring soon — refreshing`);
  const refreshed = await refreshAccessToken(token.refreshToken);

  await tokenRepo.updateTokens(
    token.spotifyUserId,
    refreshed.accessToken,
    refreshed.refreshToken,
    refreshed.expiresAt,
  );

  // Mutate in-place so callers have the updated token
  token.accessToken = refreshed.accessToken;
  token.refreshToken = refreshed.refreshToken;
  token.expiresAt = refreshed.expiresAt;

  return refreshed.accessToken;
}

export async function fetchRecentlyPlayed(
  token: OAuthToken,
  afterMs: number | null,
): Promise<SpotifyRecentlyPlayedResponse> {
  const accessToken = await getValidToken(token);

  const params: Record<string, string | number> = { limit: 50 };
  if (afterMs !== null) {
    params.after = afterMs;
  }

  const response = await axios.get<SpotifyRecentlyPlayedResponse>(
    `${SPOTIFY_API_BASE}/me/player/recently-played`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
      timeout: REQUEST_TIMEOUT_MS,
    },
  );

  return response.data;
}

export async function fetchUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
  const response = await axios.get<SpotifyUserProfile>(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: REQUEST_TIMEOUT_MS,
  });
  return response.data;
}
