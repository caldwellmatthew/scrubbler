import * as tokenRepo from '../shared/repositories/tokenRepo';
import * as trackRepo from '../shared/repositories/trackRepo';
import * as historyRepo from '../shared/repositories/historyRepo';
import { fetchRecentlyPlayed } from '../shared/spotify/client';
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

  if (items.length === 0) {
    console.log('[worker] No new tracks since last poll');
    // Still update last_polled_at even when there's nothing new
    if (cursor !== null) {
      await historyRepo.updatePollState(cursor);
    }
    return;
  }

  // 4. Upsert track metadata
  const tracks = items.map(itemToTrack);
  await trackRepo.upsertMany(tracks);

  // 5. Insert listen events (idempotent via ON CONFLICT DO NOTHING)
  const events = items.map((item) => itemToListenEvent(item, token.spotifyUserId));
  const inserted = await historyRepo.insertMany(events);

  // 6. Advance cursor to the most recent played_at (items are newest-first)
  const newestMs = new Date(items[0].played_at).getTime();
  await historyRepo.updatePollState(newestMs);

  console.log(
    `[worker] Fetched ${items.length} items, inserted ${inserted} new events. ` +
    `Cursor advanced to ${new Date(newestMs).toISOString()}`,
  );
}
