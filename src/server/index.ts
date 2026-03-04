import express from 'express';
import { config } from '../shared/config';
import { authRouter } from './routes/auth';
import { historyRouter } from './routes/history';
import { pollRouter } from './routes/poll';
import { explorerRouter } from './routes/explorer';
import { lastfmRouter } from './routes/lastfm';
import { uiRouter } from './routes/ui';
import { errorHandler } from './middleware/errorHandler';
import * as tokenRepo from '../shared/repositories/tokenRepo';
import * as lastfmRepo from '../shared/repositories/lastfmRepo';
import * as lastfmClient from '../shared/lastfm/client';
import { fetchCurrentlyPlaying } from '../shared/spotify/client';
import { cleanName } from '../shared/lastfm/clean';

const app = express();

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Now playing
app.get('/now-playing', async (_req, res, next) => {
  try {
    const [token, session] = await Promise.all([tokenRepo.getFirst(), lastfmRepo.getSession()]);
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
  } catch (err) { next(err); }
});

// Push current Spotify track to Last.fm now-playing
app.post('/now-playing/push', async (_req, res, next) => {
  try {
    const [token, session] = await Promise.all([tokenRepo.getFirst(), lastfmRepo.getSession()]);
    if (!token || !session?.autoScrobbleEnabled) { res.json({ ok: false }); return; }
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
  } catch (err) { next(err); }
});

// Routes
app.use('/', uiRouter);
app.use('/auth', authRouter);
app.use('/history', historyRouter);
app.use('/poll', pollRouter);
app.use('/explorer', explorerRouter);
app.use('/lastfm', lastfmRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[server] Listening on http://localhost:${config.port}`);
  console.log(`[server] OAuth login: http://localhost:${config.port}/auth/login`);
});

export default app;
