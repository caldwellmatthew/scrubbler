import { Router } from 'express';
import { config } from '../../shared/config';
import * as lastfmAuth from '../../shared/lastfm/auth';
import * as lastfmClient from '../../shared/lastfm/client';
import * as lastfmRepo from '../../shared/repositories/lastfmRepo';
import * as historyRepo from '../../shared/repositories/historyRepo';
import * as tokenRepo from '../../shared/repositories/tokenRepo';
import { fetchCurrentlyPlaying } from '../../shared/spotify/client';
import { cleanName } from '../../shared/lastfm/clean';
import { buildScrobbleItems, markScrobbledWithSanitizeInfo, buildNowPlayingPayload } from '../../shared/lastfm/scrobble';

export const lastfmRouter = Router();

const LASTFM_AUTH_URL = 'https://www.last.fm/api/auth/';


lastfmRouter.get('/status', async (req, res, next) => {
  try {
    if (!config.lastfmEnabled) {
      res.json({ enabled: false, connected: false });
      return;
    }
    const session = await lastfmRepo.getSession(req.user!.spotifyUserId);
    if (session) {
      res.json({ enabled: true, connected: true, username: session.username });
    } else {
      res.json({ enabled: true, connected: false });
    }
  } catch (err) {
    next(err);
  }
});

lastfmRouter.get('/login', (req, res) => {
  if (!config.lastfmEnabled) {
    res.status(503).json({ error: 'Last.fm not configured' });
    return;
  }
  const callbackUrl = `${req.protocol}://${req.get('host')}/lastfm/callback`;
  const params = new URLSearchParams({
    api_key: config.lastfmApiKey,
    cb: callbackUrl,
  });
  res.redirect(`${LASTFM_AUTH_URL}?${params.toString()}`);
});

lastfmRouter.get('/callback', async (req, res, next) => {
  try {
    if (!config.lastfmEnabled) {
      res.status(503).json({ error: 'Last.fm not configured' });
      return;
    }
    const { token } = req.query as Record<string, string | undefined>;
    if (!token) {
      res.status(400).json({ error: 'Missing token in callback' });
      return;
    }
    const { spotifyUserId } = req.user!;
    const { username, sessionKey } = await lastfmAuth.getSession(token);
    await lastfmRepo.upsertSession(spotifyUserId, username, sessionKey);
    console.log(`[lastfm] Connected Last.fm user: ${username} for Spotify user: ${spotifyUserId}`);
    res.redirect(config.clientOrigin + '/');
  } catch (err) {
    next(err);
  }
});

lastfmRouter.post('/disconnect', async (req, res, next) => {
  try {
    await lastfmRepo.deleteBySpotifyUserId(req.user!.spotifyUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

lastfmRouter.get('/auto-scrobble', async (req, res, next) => {
  try {
    const session = await lastfmRepo.getSession(req.user!.spotifyUserId);
    res.json({ enabled: session?.autoScrobbleEnabled ?? false });
  } catch (err) { next(err); }
});

lastfmRouter.post('/auto-scrobble', async (req, res, next) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    await lastfmRepo.setAutoScrobble(req.user!.spotifyUserId, enabled);
    res.json({ ok: true, enabled });
  } catch (err) { next(err); }
});

lastfmRouter.get('/now-playing-enabled', async (req, res, next) => {
  try {
    const session = await lastfmRepo.getSession(req.user!.spotifyUserId);
    res.json({ enabled: session?.nowPlayingEnabled ?? false });
  } catch (err) { next(err); }
});

lastfmRouter.post('/now-playing-enabled', async (req, res, next) => {
  try {
    const { spotifyUserId } = req.user!;
    const { enabled } = req.body as { enabled: boolean };
    await lastfmRepo.setNowPlayingEnabled(spotifyUserId, enabled);
    if (enabled) {
      const session = await lastfmRepo.getSession(spotifyUserId);
      const token = await tokenRepo.getBySpotifyUserId(spotifyUserId);
      if (session && token) {
        const nowPlaying = await fetchCurrentlyPlaying(token);
        if (nowPlaying?.is_playing && nowPlaying.item) {
          await lastfmClient.updateNowPlaying(
            buildNowPlayingPayload(nowPlaying.item, session.sanitizeNowPlaying),
            session.sessionKey,
          );
        }
      }
    }
    res.json({ ok: true, enabled });
  } catch (err) { next(err); }
});

lastfmRouter.get('/sanitize-scrobble', async (req, res, next) => {
  try {
    const session = await lastfmRepo.getSession(req.user!.spotifyUserId);
    res.json({ enabled: session?.sanitizeScrobble ?? true });
  } catch (err) { next(err); }
});

lastfmRouter.post('/sanitize-scrobble', async (req, res, next) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    await lastfmRepo.setSanitizeScrobble(req.user!.spotifyUserId, enabled);
    res.json({ ok: true, enabled });
  } catch (err) { next(err); }
});

lastfmRouter.get('/sanitize-now-playing', async (req, res, next) => {
  try {
    const session = await lastfmRepo.getSession(req.user!.spotifyUserId);
    res.json({ enabled: session?.sanitizeNowPlaying ?? true });
  } catch (err) { next(err); }
});

lastfmRouter.post('/sanitize-now-playing', async (req, res, next) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    await lastfmRepo.setSanitizeNowPlaying(req.user!.spotifyUserId, enabled);
    res.json({ ok: true, enabled });
  } catch (err) { next(err); }
});

lastfmRouter.post('/preview', async (req, res, next) => {
  try {
    if (!config.lastfmEnabled) {
      res.status(503).json({ error: 'Last.fm not configured' });
      return;
    }
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }
    const rows = await historyRepo.getByIds(ids, req.user!.spotifyUserId);
    rows.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
    const items = rows.map((row) => ({
      id: row.id,
      playedAt: row.playedAt,
      artist: row.artistName.split(', ')[0],
      track: cleanName(row.name),
      album: cleanName(row.albumName),
      originalTrack: row.name,
      originalAlbum: row.albumName,
    }));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

lastfmRouter.post('/scrobble', async (req, res, next) => {
  try {
    if (!config.lastfmEnabled) {
      res.status(503).json({ error: 'Last.fm not configured' });
      return;
    }
    const { spotifyUserId } = req.user!;
    const session = await lastfmRepo.getSession(spotifyUserId);
    if (!session) {
      res.status(401).json({ error: 'Not connected to Last.fm' });
      return;
    }
    const { ids, overrides = {} } = req.body as {
      ids: string[];
      overrides?: Record<string, { track?: string; album?: string }>;
    };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }
    const rows = await historyRepo.getByIds(ids, spotifyUserId);
    const items = buildScrobbleItems(rows, { overrides });
    await lastfmClient.scrobble(items, session.sessionKey);
    await markScrobbledWithSanitizeInfo(rows, items);
    res.json({ ok: true, scrobbled: items.length });
  } catch (err) {
    next(err);
  }
});
