import { Router } from 'express';
import * as tokenRepo from '../../shared/repositories/tokenRepo';
import * as lastfmRepo from '../../shared/repositories/lastfmRepo';
import * as lastfmClient from '../../shared/lastfm/client';
import { fetchCurrentlyPlaying } from '../../shared/spotify/client';
import { cleanName } from '../../shared/lastfm/clean';
import { buildNowPlayingPayload } from '../../shared/lastfm/scrobble';

export const nowPlayingRouter = Router();

nowPlayingRouter.get('/', async (req, res, next) => {
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
    next(err);
  }
});

nowPlayingRouter.post('/push', async (req, res, next) => {
  try {
    const { spotifyUserId } = req.user!;
    const [token, session] = await Promise.all([
      tokenRepo.getBySpotifyUserId(spotifyUserId),
      lastfmRepo.getSession(spotifyUserId),
    ]);
    if (!token || !session?.nowPlayingEnabled) { res.json({ ok: false }); return; }
    const data = await fetchCurrentlyPlaying(token);
    if (!data?.is_playing || !data.item) { res.json({ ok: false }); return; }
    await lastfmClient.updateNowPlaying(
      buildNowPlayingPayload(data.item, session.sanitizeNowPlaying),
      session.sessionKey,
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
