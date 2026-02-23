import { Router } from 'express';
import { config } from '../../shared/config';
import * as lastfmAuth from '../../shared/lastfm/auth';
import * as lastfmClient from '../../shared/lastfm/client';
import * as lastfmRepo from '../../shared/repositories/lastfmRepo';
import * as historyRepo from '../../shared/repositories/historyRepo';

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
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }
    const rows = await historyRepo.getByIds(ids);
    const items: lastfmClient.ScrobbleItem[] = rows.map((row) => ({
      artist: row.artistName,
      track: row.name,
      album: row.albumName,
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
