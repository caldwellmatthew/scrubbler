import * as tokenRepo from '../shared/repositories/tokenRepo';
import * as trackRepo from '../shared/repositories/trackRepo';
import * as historyRepo from '../shared/repositories/historyRepo';
import * as lastfmRepo from '../shared/repositories/lastfmRepo';
import * as lastfmClient from '../shared/lastfm/client';
import { fetchRecentlyPlayed, fetchCurrentlyPlaying } from '../shared/spotify/client';
import { cleanName } from '../shared/lastfm/clean';
import { getPool } from '../shared/db';
import type { ListenEvent, Track } from '../shared/types';
import type { SpotifyPlayHistoryItem } from '../shared/types';

function itemToTrack(item: SpotifyPlayHistoryItem): Track {
  const { track } = item;
  const artist = track.artists.map((a) => a.name).join(', ');
  const image = track.album.images[0]?.url ?? null;

  return {
    spotifyTrackId: track.id,
    name: track.name,
    artistName: artist,
    albumName: track.album.name,
    durationMs: track.duration_ms,
    externalUrl: track.external_urls.spotify ?? null,
    previewUrl: track.preview_url,
    imageUrl: image,
    updatedAt: new Date(),
  };
}

function itemToListenEvent(item: SpotifyPlayHistoryItem, spotifyUserId: string): ListenEvent {
  return {
    spotifyTrackId: item.track.id,
    spotifyUserId,
    playedAt: new Date(item.played_at),
  };
}

export async function poll(): Promise<void> {
  // 1. Check poll_enabled flag
  const pollState = await historyRepo.getPollState();
  if (!pollState.pollEnabled) {
    console.log('[worker] Polling is disabled — skipping');
    return;
  }

  // 2. Load token — bail if user hasn't authenticated yet
  const token = await tokenRepo.getFirst();
  if (!token) {
    console.log('[worker] No OAuth token found — waiting for user to authenticate via /auth/login');
    return;
  }

  // 3. Get cursor from poll_state (already fetched above)
  const cursor = pollState.lastPlayedAtMs;

  // 4. Fetch from Spotify
  console.log(`[worker] Polling recently-played (after=${cursor ?? 'beginning'})`);
  const response = await fetchRecentlyPlayed(token, cursor);
  const items = response.items;

  let events: ListenEvent[] = [];
  if (items.length === 0) {
    console.log('[worker] No new tracks since last poll');
    await historyRepo.updatePollState(null); // stamps last_polled_at, preserves cursor
  } else {
    // 4+5. Upsert tracks and insert events in a single transaction
    const tracks = items.map(itemToTrack);
    events = items.map((item) => itemToListenEvent(item, token.spotifyUserId));
    const newestMs = new Date(items[0].played_at).getTime();

    const client = await getPool().connect();
    let inserted = 0;
    try {
      await client.query('BEGIN');
      await trackRepo.upsertMany(tracks, client);
      inserted = await historyRepo.insertMany(events, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 6. Advance cursor only after successful commit
    await historyRepo.updatePollState(newestMs);

    console.log(
      `[worker] Fetched ${items.length} items, inserted ${inserted} new events. ` +
      `Cursor advanced to ${new Date(newestMs).toISOString()}`,
    );
  }

  // 7. Auto-scrobble if enabled
  const session = await lastfmRepo.getSession();
  if (session?.autoScrobbleEnabled && events.length > 0) {
    try {
      const rows = await historyRepo.getUnscrobbledByPlayedAts(events.map(e => e.playedAt));
      if (rows.length > 0) {
        rows.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
        const sanitize = session.sanitizeScrobble;
        const scrobbleItems = rows.map(row => ({
          artist: row.artistName.split(', ')[0],
          track: sanitize ? cleanName(row.name) : row.name,
          album: sanitize ? cleanName(row.albumName) : row.albumName,
          timestamp: Math.floor(row.playedAt.getTime() / 1000),
          duration: Math.floor(row.durationMs / 1000),
        }));
        await lastfmClient.scrobble(scrobbleItems, session.sessionKey);
        await historyRepo.markScrobbled(rows.map(r => r.id));
        console.log(`[worker] Auto-scrobbled ${scrobbleItems.length} tracks to Last.fm`);
      }
    } catch (err) {
      console.error('[worker] Auto-scrobble failed:', err);
    }
  }

  // 8. Update Last.fm now playing if enabled (independent of auto-scrobble)
  if (session?.nowPlayingEnabled) {
    try {
      const nowPlaying = await fetchCurrentlyPlaying(token);
      if (nowPlaying?.is_playing && nowPlaying.item) {
        const t = nowPlaying.item;
        const sanitize = session.sanitizeNowPlaying;
        console.log(`[worker] Now playing: "${t.name}" by ${t.artists[0].name}`);
        await lastfmClient.updateNowPlaying({
          artist: t.artists[0].name,
          track: sanitize ? cleanName(t.name) : t.name,
          album: sanitize ? cleanName(t.album.name) : t.album.name,
          duration: Math.floor(t.duration_ms / 1000),
        }, session.sessionKey);
        console.log(`[worker] Sent now playing to Last.fm: "${sanitize ? cleanName(t.name) : t.name}" by ${t.artists[0].name}`);
      } else {
        console.log(`[worker] Now playing: nothing (Spotify idle or no active device)`);
      }
    } catch (err) {
      console.error('[worker] Now playing update failed:', err);
    }
  }
}
