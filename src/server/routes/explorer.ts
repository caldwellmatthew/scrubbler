import { Router } from 'express';
import axios, { AxiosError } from 'axios';
import * as tokenRepo from '../../shared/repositories/tokenRepo';
import { getValidToken } from '../../shared/spotify/client';

export const explorerRouter = Router();

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const REQUEST_TIMEOUT_MS = 10_000;

// GET /explorer/proxy?endpoint=/me/player/recently-played&limit=5
explorerRouter.get('/proxy', async (req, res, next) => {
  try {
    const { endpoint, ...params } = req.query as Record<string, string>;

    if (!endpoint) {
      res.status(400).json({ error: 'Missing required query param: endpoint' });
      return;
    }

    const token = await tokenRepo.getBySpotifyUserId(req.user!.spotifyUserId);
    if (!token) {
      res.status(401).json({ error: 'Not authenticated — complete OAuth first' });
      return;
    }

    const accessToken = await getValidToken(token);

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
