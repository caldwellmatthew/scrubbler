import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from '../shared/config';
import { authRouter } from './routes/auth';
import { historyRouter } from './routes/history';
import { pollRouter } from './routes/poll';
import { explorerRouter } from './routes/explorer';
import { lastfmRouter } from './routes/lastfm';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/auth';
import * as tokenRepo from '../shared/repositories/tokenRepo';
import * as lastfmRepo from '../shared/repositories/lastfmRepo';
import * as lastfmClient from '../shared/lastfm/client';
import { fetchCurrentlyPlaying } from '../shared/spotify/client';
import { cleanName } from '../shared/lastfm/clean';
import { checkConnection, isDbConnectionError, dbErrorMessage } from '../shared/db';

const app = express();

app.use(express.json());
app.use(cookieParser(config.oauthStateSecret));

// Health check
app.get('/health', async (_req, res) => {
  try {
    await checkConnection();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', error: 'Database unavailable', timestamp: new Date().toISOString() });
  }
});

// Auth routes (no auth required — handles login/callback/status/logout)
app.use('/auth', authRouter);

// Now playing
app.get('/now-playing', requireAuth, async (req, res) => {
  try {
    const { spotifyUserId } = req.user!;
    const [token, session] = await Promise.all([
      tokenRepo.getBySpotifyUserId(spotifyUserId),
      lastfmRepo.getSession(spotifyUserId),
    ]);
    if (!token) { res.json({ isPlaying: false, track: null }); return; }
    const data = await fetchCurrentlyPlaying(token);
    if (!data?.is_playing || !data.item) { res.json({ isPlaying: false, track: null }); return; }
    const t = data.item;
    res.json({
      isPlaying: true,
      sanitizeNowPlaying: session?.sanitizeNowPlaying ?? true,
      track: {
        name: t.name,
        artistName: t.artists.map(a => a.name).join(', '),
        albumName: t.album.name,
        cleanedName: cleanName(t.name),
        cleanedAlbumName: cleanName(t.album.name),
        durationMs: t.duration_ms,
        imageUrl: t.album.images[0]?.url ?? null,
        externalUrl: t.external_urls.spotify,
      },
    });
  } catch (err) {
    if (isDbConnectionError(err)) { res.status(503).json({ error: 'Database unavailable' }); return; }
    console.error('[server] now-playing error:', err instanceof Error ? err.message : err);
    res.json({ isPlaying: false, track: null, error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// Push current Spotify track to Last.fm now-playing
app.post('/now-playing/push', requireAuth, async (req, res) => {
  try {
    const { spotifyUserId } = req.user!;
    const [token, session] = await Promise.all([
      tokenRepo.getBySpotifyUserId(spotifyUserId),
      lastfmRepo.getSession(spotifyUserId),
    ]);
    if (!token || !session?.nowPlayingEnabled) { res.json({ ok: false }); return; }
    const data = await fetchCurrentlyPlaying(token);
    if (!data?.is_playing || !data.item) { res.json({ ok: false }); return; }
    const t = data.item;
    const sanitize = session.sanitizeNowPlaying;
    await lastfmClient.updateNowPlaying({
      artist: t.artists[0].name,
      track: sanitize ? cleanName(t.name) : t.name,
      album: sanitize ? cleanName(t.album.name) : t.album.name,
      duration: Math.floor(t.duration_ms / 1000),
    }, session.sessionKey);
    res.json({ ok: true });
  } catch (err) {
    if (isDbConnectionError(err)) { res.status(503).json({ error: 'Database unavailable' }); return; }
    console.error('[server] now-playing/push error:', err instanceof Error ? err.message : err);
    res.json({ ok: false });
  }
});

// Protected routes
app.use('/history', requireAuth, historyRouter);
app.use('/poll', requireAuth, pollRouter);
app.use('/explorer', requireAuth, explorerRouter);
app.use('/lastfm', requireAuth, lastfmRouter);

// Production: serve Vite-built client
if (process.env.NODE_ENV === 'production') {
  const clientDir = path.join(__dirname, '../client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

// 404 handler (only reached in dev or for unknown API paths)
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

checkConnection()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`[server] Listening on http://localhost:${config.port}`);
      console.log(`[server] OAuth login: http://localhost:${config.port}/auth/login`);
    });
  })
  .catch((err) => {
    console.error(`[server] Failed to connect to database: ${dbErrorMessage(err)}`);
    console.error('[server] Is PostgreSQL running? Check DATABASE_URL in your .env');
    process.exit(1);
  });

export default app;
