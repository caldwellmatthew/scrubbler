import { Router } from 'express';
import axios, { AxiosError } from 'axios';
import * as tokenRepo from '../../shared/repositories/tokenRepo';
import { refreshAccessToken } from '../../shared/spotify/auth';
import { updateTokens } from '../../shared/repositories/tokenRepo';

export const explorerRouter = Router();

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const REFRESH_BUFFER_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

// GET /explorer/proxy?endpoint=/me/player/recently-played&limit=5
explorerRouter.get('/proxy', async (req, res, next) => {
  try {
    const { endpoint, ...params } = req.query as Record<string, string>;

    if (!endpoint) {
      res.status(400).json({ error: 'Missing required query param: endpoint' });
      return;
    }

    const token = await tokenRepo.getFirst();
    if (!token) {
      res.status(401).json({ error: 'Not authenticated — complete OAuth first' });
      return;
    }

    // Refresh token if needed
    let accessToken = token.accessToken;
    if (token.expiresAt.getTime() - Date.now() <= REFRESH_BUFFER_MS) {
      const refreshed = await refreshAccessToken(token.refreshToken);
      await updateTokens(token.spotifyUserId, refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt);
      accessToken = refreshed.accessToken;
    }

    const url = `${SPOTIFY_API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
        timeout: REQUEST_TIMEOUT_MS,
      });
      res.json({ status: response.status, data: response.data });
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response) {
        // Return Spotify's error response as-is so the UI can show it
        res.json({ status: axiosErr.response.status, data: axiosErr.response.data });
      } else {
        throw err;
      }
    }
  } catch (err) {
    next(err);
  }
});
