import * as tokenRepo from '../shared/repositories/tokenRepo';
import * as trackRepo from '../shared/repositories/trackRepo';
import * as historyRepo from '../shared/repositories/historyRepo';
import * as lastfmRepo from '../shared/repositories/lastfmRepo';
import * as lastfmClient from '../shared/lastfm/client';
import { fetchRecentlyPlayed, fetchCurrentlyPlaying } from '../shared/spotify/client';
import { cleanName } from '../shared/lastfm/clean';
import { getPool } from '../shared/db';
import type { ListenEvent, OAuthToken, Track } from '../shared/types';
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

async function pollUser(token: OAuthToken): Promise<void> {
  const { spotifyUserId } = token;
  const tag = `[user:${spotifyUserId}]`;

  // 1. Check poll_enabled flag for this user
  const pollState = await historyRepo.getPollState(spotifyUserId);
  if (!pollState.pollEnabled) {
    console.log(`[worker] ${tag} Polling is disabled — skipping`);
    return;
  }

  // 2. Get cursor from poll_state
  const cursor = pollState.lastPlayedAtMs;

  // 3. Fetch from Spotify
  console.log(`[worker] ${tag} Polling recently-played (after=${cursor ?? 'beginning'})`);
  const response = await fetchRecentlyPlayed(token, cursor);
  const items = response.items;

  let events: ListenEvent[] = [];
  if (items.length === 0) {
    console.log(`[worker] ${tag} No new tracks since last poll`);
    await historyRepo.updatePollState(spotifyUserId, null); // stamps last_polled_at, preserves cursor
  } else {
    // 4+5. Upsert tracks and insert events in a single transaction
    const tracks = items.map(itemToTrack);
    events = items.map((item) => itemToListenEvent(item, spotifyUserId));
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
    await historyRepo.updatePollState(spotifyUserId, newestMs);

    console.log(
      `[worker] ${tag} Fetched ${items.length} items, inserted ${inserted} new events. ` +
      `Cursor advanced to ${new Date(newestMs).toISOString()}`,
    );
  }

  // 7. Auto-scrobble if enabled
  const session = await lastfmRepo.getSession(spotifyUserId);
  if (session?.autoScrobbleEnabled && events.length > 0) {
    try {
      const rows = await historyRepo.getUnscrobbledByPlayedAts(spotifyUserId, events.map(e => e.playedAt));
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
        // Mark each row with whether sanitization actually changed its values
        const sanitizedIds = rows.filter(r => cleanName(r.name) !== r.name || cleanName(r.albumName) !== r.albumName).map(r => String(r.id));
        const unsanitizedIds = rows.filter(r => cleanName(r.name) === r.name && cleanName(r.albumName) === r.albumName).map(r => String(r.id));
        if (sanitizedIds.length > 0) await historyRepo.markScrobbled(sanitizedIds, true);
        if (unsanitizedIds.length > 0) await historyRepo.markScrobbled(unsanitizedIds, false);
        console.log(`[worker] ${tag} Auto-scrobbled ${scrobbleItems.length} tracks to Last.fm`);
      }
    } catch (err) {
      console.error(`[worker] ${tag} Auto-scrobble failed:`, err);
    }
  }

  // 8. Update Last.fm now playing if enabled (independent of auto-scrobble)
  if (session?.nowPlayingEnabled) {
    try {
      const nowPlaying = await fetchCurrentlyPlaying(token);
      if (nowPlaying?.is_playing && nowPlaying.item) {
        const t = nowPlaying.item;
        const sanitize = session.sanitizeNowPlaying;
        console.log(`[worker] ${tag} Now playing: "${t.name}" by ${t.artists[0].name}`);
        await lastfmClient.updateNowPlaying({
          artist: t.artists[0].name,
          track: sanitize ? cleanName(t.name) : t.name,
          album: sanitize ? cleanName(t.album.name) : t.album.name,
          duration: Math.floor(t.duration_ms / 1000),
        }, session.sessionKey);
        console.log(`[worker] ${tag} Sent now playing to Last.fm: "${sanitize ? cleanName(t.name) : t.name}" by ${t.artists[0].name}`);
      } else {
        console.log(`[worker] ${tag} Now playing: nothing (Spotify idle or no active device)`);
      }
    } catch (err) {
      console.error(`[worker] ${tag} Now playing update failed:`, err);
    }
  }
}

export async function poll(): Promise<void> {
  const tokens = await tokenRepo.getAll();
  if (tokens.length === 0) {
    console.log('[worker] No OAuth tokens found — waiting for users to authenticate via /auth/login');
    return;
  }

  await Promise.all(tokens.map(async (token) => {
    try {
      await pollUser(token);
    } catch (err) {
      console.error(`[worker] [user:${token.spotifyUserId}] Poll failed:`, err);
    }
  }));
}
