import * as tokenRepo from '../shared/repositories/tokenRepo';
import * as trackRepo from '../shared/repositories/trackRepo';
import * as historyRepo from '../shared/repositories/historyRepo';
import * as lastfmRepo from '../shared/repositories/lastfmRepo';
import * as lastfmClient from '../shared/lastfm/client';
import { buildScrobbleItems, markScrobbledWithSanitizeInfo, buildNowPlayingPayload, partitionDuplicatePlays, DUPLICATE_PLAY_REASON } from '../shared/lastfm/scrobble';
import { fetchRecentlyPlayed, fetchCurrentlyPlaying } from '../shared/spotify/client';
import { getPool } from '../shared/db';
import type { ListenEvent, OAuthToken, Track } from '../shared/types';
import type { SpotifyPlayHistoryItem } from '../shared/types';

function itemToTrack(item: SpotifyPlayHistoryItem): Track {
  const { track } = item;
  const image = track.album.images[0]?.url ?? null;

  return {
    spotifyTrackId: track.id,
    name: track.name,
    artistNames: track.artists.map((a) => a.name),
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

  // 2. Fetch the newest page; the unique constraint discards plays already stored
  const items = (await fetchRecentlyPlayed(token)).items;
  const previousNewestMs = pollState.lastPlayedAtMs;

  let insertedIds: string[] = [];
  if (items.length > 0) {
    // 3. Upsert tracks and insert events in a single transaction
    const tracks = items.map(itemToTrack);
    const events = items.map((item) => itemToListenEvent(item, spotifyUserId));

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await trackRepo.upsertMany(tracks, client);
      insertedIds = await historyRepo.insertMany(events, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (insertedIds.length > 0) {
      // Anything newer than the previous newest is necessarily new; the rest arrived late
      const fresh = previousNewestMs === null
        ? insertedIds.length
        : events.filter((e) => e.playedAt.getTime() > previousNewestMs).length;
      const late = insertedIds.length - fresh;
      console.log(
        `[worker] ${tag} Inserted ${insertedIds.length} new plays` +
        (late > 0 ? `, ${late} of them older than plays already stored` : ''),
      );
    }
  }

  // 4. Record the newest play seen, kept for reference only — fetching no longer reads it
  const newestMs = items.length > 0 ? new Date(items[0].played_at).getTime() : null;
  await historyRepo.updatePollState(spotifyUserId, newestMs);

  // 5. Auto-scrobble the plays this poll added, if enabled
  const session = await lastfmRepo.getSession(spotifyUserId);
  if (session?.autoScrobbleEnabled && insertedIds.length > 0) {
    try {
      const candidates = await historyRepo.getByIds(insertedIds, spotifyUserId);
      const { kept: rows, duplicates } = partitionDuplicatePlays(candidates);
      duplicates.forEach(({ row, priorPlayedAt }) => {
        console.log(
          `[worker] ${tag} Skipping "${row.name}" by ${row.artistNames[0]} — repeat of the play at ` +
          `${priorPlayedAt.toISOString()}, sooner than its ${Math.round(row.durationMs / 1000)}s duration`,
        );
      });
      // Recorded so a further entry in the same run does not scrobble it again
      await historyRepo.markSkipped(duplicates.map(({ row }) => String(row.id)), DUPLICATE_PLAY_REASON);
      if (rows.length > 0) {
        rows.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
        const scrobbleItems = buildScrobbleItems(rows, { sanitize: session.sanitizeScrobble });
        const results = await lastfmClient.scrobble(scrobbleItems, session.sessionKey);
        await markScrobbledWithSanitizeInfo(rows, scrobbleItems, results);
        const accepted = results.filter((r) => r.accepted).length;
        console.log(`[worker] ${tag} Auto-scrobbled ${accepted}/${scrobbleItems.length} tracks to Last.fm`);
        results.forEach((result, i) => {
          if (!result.accepted) {
            const item = scrobbleItems[i];
            console.warn(
              `[worker] ${tag} Last.fm ignored scrobble of "${item.track}" by ${item.artist}: ${result.ignoredReason}`,
            );
          }
        });
      }
    } catch (err) {
      console.error(`[worker] ${tag} Auto-scrobble failed:`, err);
    }
  }

  // 6. Update Last.fm now playing if enabled (independent of auto-scrobble)
  if (session?.nowPlayingEnabled) {
    try {
      const nowPlaying = await fetchCurrentlyPlaying(token);
      if (nowPlaying?.is_playing && nowPlaying.item) {
        const t = nowPlaying.item;
        const payload = buildNowPlayingPayload(t, session.sanitizeNowPlaying);
        console.log(`[worker] ${tag} Now playing: "${t.name}" by ${t.artists[0].name}`);
        await lastfmClient.updateNowPlaying(payload, session.sessionKey);
        console.log(`[worker] ${tag} Sent now playing to Last.fm: "${payload.track}" by ${payload.artist}`);
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
