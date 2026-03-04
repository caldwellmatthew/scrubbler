import { Router } from 'express';
import { config } from '../../shared/config';
import * as lastfmAuth from '../../shared/lastfm/auth';
import * as lastfmClient from '../../shared/lastfm/client';
import * as lastfmRepo from '../../shared/repositories/lastfmRepo';
import * as historyRepo from '../../shared/repositories/historyRepo';
import * as tokenRepo from '../../shared/repositories/tokenRepo';
import { fetchCurrentlyPlaying } from '../../shared/spotify/client';
import { cleanName } from '../../shared/lastfm/clean';

export const lastfmRouter = Router();

const LASTFM_AUTH_URL = 'https://www.last.fm/api/auth/';


lastfmRouter.get('/status', async (_req, res, next) => {
  try {
    if (!config.lastfmEnabled) {
      res.json({ enabled: false, connected: false });
      return;
    }
    const session = await lastfmRepo.getSession();
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
    const { username, sessionKey } = await lastfmAuth.getSession(token);
    await lastfmRepo.upsertSession(username, sessionKey);
    console.log(`[lastfm] Connected Last.fm user: ${username}`);
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

lastfmRouter.post('/disconnect', async (_req, res, next) => {
  try {
    await lastfmRepo.deleteAll();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

lastfmRouter.get('/auto-scrobble', async (_req, res, next) => {
  try {
    const session = await lastfmRepo.getSession();
    res.json({ enabled: session?.autoScrobbleEnabled ?? false });
  } catch (err) { next(err); }
});

lastfmRouter.post('/auto-scrobble', async (req, res, next) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    await lastfmRepo.setAutoScrobble(enabled);
    if (enabled) {
      const session = await lastfmRepo.getSession();
      const token = await tokenRepo.getFirst();
      if (session && token) {
        const nowPlaying = await fetchCurrentlyPlaying(token);
        if (nowPlaying?.is_playing && nowPlaying.item) {
          const t = nowPlaying.item;
          const sanitize = session.sanitizeNowPlaying;
          await lastfmClient.updateNowPlaying({
            artist: t.artists[0].name,
            track: sanitize ? cleanName(t.name) : t.name,
            album: sanitize ? cleanName(t.album.name) : t.album.name,
            duration: Math.floor(t.duration_ms / 1000),
          }, session.sessionKey);
        }
      }
    }
    res.json({ ok: true, enabled });
  } catch (err) { next(err); }
});

lastfmRouter.get('/sanitize-now-playing', async (_req, res, next) => {
  try {
    const session = await lastfmRepo.getSession();
    res.json({ enabled: session?.sanitizeNowPlaying ?? true });
  } catch (err) { next(err); }
});

lastfmRouter.post('/sanitize-now-playing', async (req, res, next) => {
  try {
    const { enabled } = req.body as { enabled: boolean };
    await lastfmRepo.setSanitizeNowPlaying(enabled);
    res.json({ ok: true, enabled });
  } catch (err) { next(err); }
});

lastfmRouter.post('/preview', async (req, res, next) => {
  try {
    if (!config.lastfmEnabled) {
      res.status(503).json({ error: 'Last.fm not configured' });
      return;
    }
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }
    const rows = await historyRepo.getByIds(ids);
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
    const session = await lastfmRepo.getSession();
    if (!session) {
      res.status(401).json({ error: 'Not connected to Last.fm' });
      return;
    }
    const { ids, overrides = {} } = req.body as {
      ids: number[];
      overrides?: Record<string, { track?: string; album?: string }>;
    };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }
    const rows = await historyRepo.getByIds(ids);
    const items: lastfmClient.ScrobbleItem[] = rows.map((row) => ({
      artist: row.artistName.split(', ')[0],
      track: overrides[row.id]?.track ?? cleanName(row.name),
      album: overrides[row.id]?.album ?? cleanName(row.albumName),
      timestamp: Math.floor(row.playedAt.getTime() / 1000),
      duration: Math.floor(row.durationMs / 1000),
    }));
    await lastfmClient.scrobble(items, session.sessionKey);
    await historyRepo.markScrobbled(ids);
    res.json({ ok: true, scrobbled: items.length });
  } catch (err) {
    next(err);
  }
});
