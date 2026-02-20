import axios from 'axios';
import { config } from '../config';
import type { SpotifyTokenResponse } from '../types';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REQUEST_TIMEOUT_MS = 10_000;

function basicAuthHeader(): string {
  const credentials = `${config.spotifyClientId}:${config.spotifyClientSecret}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await axios.post<SpotifyTokenResponse>(TOKEN_URL, params, {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: REQUEST_TIMEOUT_MS,
  });

  const data = response.data;
  if (!data.refresh_token) {
    throw new Error('Spotify did not return a refresh_token during code exchange');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet & { refreshToken: string }> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await axios.post<SpotifyTokenResponse>(TOKEN_URL, params, {
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: REQUEST_TIMEOUT_MS,
  });

  const data = response.data;

  return {
    accessToken: data.access_token,
    // Spotify may or may not return a new refresh token; keep the old one if not
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}
