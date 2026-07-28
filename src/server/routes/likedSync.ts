import { Router } from 'express';
import { config } from '../../shared/config';
import { mapWithConcurrency } from '../../shared/batch';
import { fetchLovedTracks } from '../../shared/lastfm/loved';
import * as lastfmRepo from '../../shared/repositories/lastfmRepo';
import * as lovedMatchRepo from '../../shared/repositories/lovedMatchRepo';
import * as tokenRepo from '../../shared/repositories/tokenRepo';
import { getValidToken } from '../../shared/spotify/client';
import { checkSaved, saveTracks, searchTracks } from '../../shared/spotify/library';
import { buildSearchQuery, confidenceTier, rankCandidates } from '../../shared/spotify/match';
import { hasLibraryScopes, missingLibraryScopes } from '../../shared/spotify/scopes';
import type { LovedMatchRow, ResolvedMatch, SpotifyTrack } from '../../shared/types';

export const likedSyncRouter = Router();

// Last.fm allows large pages, so mirroring the whole loved list is normally one
// or two requests. The page cap only bounds a pathologically large library.
const LOVED_PAGE_SIZE = 1000;
const MAX_LOVED_PAGES = 20;

const DEFAULT_SCAN_LIMIT = 25;
const MAX_SCAN_LIMIT = 100;
const SEARCH_CONCURRENCY = 4;

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
const MAX_APPLY_ITEMS = 200;

interface MatchProposal {
  id: string;
  lastfmArtist: string;
  lastfmTrack: string;
  lovedAt: string | null;
  status: string;
  confidence: string | null;
  score: number | null;
  alreadyLiked: boolean;
  match: {
    spotifyTrackId: string;
    name: string;
    artistName: string;
    albumName: string;
    imageUrl: string | null;
    externalUrl: string | null;
    durationMs: number | null;
  } | null;
  alternates: Array<{
    spotifyTrackId: string;
    name: string;
    artistName: string;
    albumName: string;
    score: number;
  }>;
}

function toProposal(row: LovedMatchRow): MatchProposal {
  return {
    id: row.id,
    lastfmArtist: row.lastfmArtist,
    lastfmTrack: row.lastfmTrack,
    lovedAt: row.lovedAt ? row.lovedAt.toISOString() : null,
    status: row.status,
    confidence: row.matchScore === null ? null : confidenceTier(row.matchScore),
    score: row.matchScore,
    alreadyLiked: row.status === 'already_liked',
    match: row.spotifyTrackId
      ? {
          spotifyTrackId: row.spotifyTrackId,
          name: row.spotifyTrackName ?? '',
          // Served joined, matching how /history exposes artists.
          artistName: (row.spotifyArtistNames ?? []).join(', '),
          albumName: row.spotifyAlbumName ?? '',
          imageUrl: row.spotifyImageUrl,
          externalUrl: row.spotifyExternalUrl,
          durationMs: row.spotifyDurationMs,
        }
      : null,
    alternates: row.candidates.map((c) => ({
      spotifyTrackId: c.spotifyTrackId,
      name: c.name,
      artistName: c.artistNames.join(', '),
      albumName: c.albumName,
      score: c.score,
    })),
  };
}

function toResolvedMatch(best: SpotifyTrack, score: number, alternates: Array<{ track: SpotifyTrack; score: number }>): ResolvedMatch {
  return {
    spotifyTrackId: best.id,
    name: best.name,
    artistNames: best.artists.map((a) => a.name),
    albumName: best.album.name,
    imageUrl: best.album.images[0]?.url ?? null,
    externalUrl: best.external_urls?.spotify ?? null,
    durationMs: best.duration_ms,
    score,
    // The winner leads the candidate list so the review UI's dropdown can show
    // the current selection alongside the alternates.
    candidates: [{ track: best, score }, ...alternates].map((c) => ({
      spotifyTrackId: c.track.id,
      name: c.track.name,
      artistNames: c.track.artists.map((a) => a.name),
      albumName: c.track.album.name,
      score: c.score,
    })),
  };
}

/**
 * Copy the Last.fm loved list into our mirror table, without searching.
 *
 * Separating this from resolution keeps a re-scan cheap: Last.fm reports the
 * true total, so once our row count matches and a page adds nothing new, we
 * know we're caught up and can stop after a single request.
 */
async function mirrorLovedTracks(
  spotifyUserId: string,
  username: string,
): Promise<{ fetched: number; added: number }> {
  let fetched = 0;
  let added = 0;

  for (let page = 1; page <= MAX_LOVED_PAGES; page++) {
    const result = await fetchLovedTracks(username, page, LOVED_PAGE_SIZE);
    fetched += result.tracks.length;
    added += await lovedMatchRepo.mirrorLoved(spotifyUserId, username, result.tracks);

    if (result.tracks.length === 0 || page >= result.totalPages) break;

    const mirrored = await lovedMatchRepo.countMirrored(spotifyUserId, username);
    if (mirrored >= result.total) break;
  }

  return { fetched, added };
}

interface ResolveOutcome {
  row: LovedMatchRow;
  match: ResolvedMatch | null;
  failed: boolean;
}

/** Search Spotify for one loved track and score the results. */
async function resolveOne(accessToken: string, row: LovedMatchRow): Promise<ResolveOutcome> {
  const { primary, fallback } = buildSearchQuery(row.lastfmArtist, row.lastfmTrack);

  try {
    let tracks = await searchTracks(accessToken, primary);
    if (tracks.length === 0) {
      tracks = await searchTracks(accessToken, fallback);
    }

    const ranked = rankCandidates({ artist: row.lastfmArtist, track: row.lastfmTrack }, tracks);
    if (!ranked) return { row, match: null, failed: false };

    return { row, match: toResolvedMatch(ranked.best.track, ranked.best.score, ranked.alternates), failed: false };
  } catch (err) {
    // A transient failure must not be recorded as "no match" — that would hide
    // the track from every future scan. Leave it unsearched and try again.
    console.error(`[liked-sync] Search failed for "${row.lastfmTrack}" by ${row.lastfmArtist}:`, err instanceof Error ? err.message : err);
    return { row, match: null, failed: true };
  }
}

likedSyncRouter.get('/status', async (req, res, next) => {
  try {
    const { spotifyUserId } = req.user!;
    const session = config.lastfmEnabled ? await lastfmRepo.getSession(spotifyUserId) : null;
    const token = await tokenRepo.getBySpotifyUserId(spotifyUserId);

    const [counts, lastScan, unsearched, mirrored] = await Promise.all([
      lovedMatchRepo.countByStatus(spotifyUserId),
      lovedMatchRepo.lastScanAt(spotifyUserId),
      session ? lovedMatchRepo.countUnsearched(spotifyUserId, session.username) : Promise.resolve(0),
      session ? lovedMatchRepo.countMirrored(spotifyUserId, session.username) : Promise.resolve(0),
    ]);

    res.json({
      lastfmEnabled: config.lastfmEnabled,
      lastfmConnected: session !== null,
      lastfmUsername: session?.username ?? null,
      spotifyScopesOk: hasLibraryScopes(token?.scope ?? null),
      missingScopes: missingLibraryScopes(token?.scope ?? null),
      counts,
      unsearched,
      totalMirrored: mirrored,
      lastScanAt: lastScan ? lastScan.toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
});

likedSyncRouter.get('/pending', async (req, res, next) => {
  try {
    const { spotifyUserId } = req.user!;
    const session = config.lastfmEnabled ? await lastfmRepo.getSession(spotifyUserId) : null;
    if (!session) {
      res.json({ items: [] });
      return;
    }

    const limit = req.query.limit === undefined ? DEFAULT_PAGE_LIMIT : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
      res.status(400).json({ error: `limit must be an integer between 1 and ${MAX_PAGE_LIMIT}` });
      return;
    }
    if (!Number.isInteger(offset) || offset < 0) {
      res.status(400).json({ error: 'offset must be a non-negative integer' });
      return;
    }

    const rows = await lovedMatchRepo.getSearchedPending(spotifyUserId, session.username, limit, offset);
    res.json({ items: rows.map(toProposal) });
  } catch (err) {
    next(err);
  }
});

likedSyncRouter.post('/scan', async (req, res, next) => {
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
    const token = await tokenRepo.getBySpotifyUserId(spotifyUserId);
    if (!token) {
      res.status(401).json({ error: 'Not authenticated with Spotify' });
      return;
    }
    if (!hasLibraryScopes(token.scope)) {
      res.status(403).json({ error: 'Spotify library access not granted — reconnect Spotify' });
      return;
    }

    const { limit = DEFAULT_SCAN_LIMIT, retryUnmatched = false } = req.body as {
      limit?: number;
      retryUnmatched?: boolean;
    };
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SCAN_LIMIT) {
      res.status(400).json({ error: `limit must be an integer between 1 and ${MAX_SCAN_LIMIT}` });
      return;
    }

    const mirror = await mirrorLovedTracks(spotifyUserId, session.username);
    const pending = await lovedMatchRepo.getUnsearched(spotifyUserId, session.username, limit, retryUnmatched === true);

    // Resolve the access token once: getValidToken mutates the token row in
    // place, so calling it inside concurrent workers races on refresh.
    const accessToken = await getValidToken(token);
    const outcomes = await mapWithConcurrency(pending, SEARCH_CONCURRENCY, (row) => resolveOne(accessToken, row));

    const searched = outcomes.filter((o) => !o.failed);
    for (const outcome of searched) {
      await lovedMatchRepo.recordMatch(outcome.row.id, outcome.match);
    }

    // Retire high-confidence matches that are already in the library. A hit on
    // a less certain match is only a badge — the user still decides.
    const matched = searched.filter((o) => o.match !== null);
    const confident = matched.filter((o) => confidenceTier(o.match!.score) === 'high');
    const alreadyLiked = new Set<string>();
    if (confident.length > 0) {
      const saved = await checkSaved(accessToken, confident.map((o) => o.match!.spotifyTrackId));
      for (const outcome of confident) {
        if (saved.get(outcome.match!.spotifyTrackId)) alreadyLiked.add(outcome.row.id);
      }
      await lovedMatchRepo.markSynced(
        confident
          .filter((o) => alreadyLiked.has(o.row.id))
          .map((o) => ({ id: o.row.id, spotifyTrackId: o.match!.spotifyTrackId })),
        'already_liked',
      );
    }

    const items = searched.map((outcome) =>
      toProposal({
        ...outcome.row,
        status: outcome.match === null ? 'no_match' : alreadyLiked.has(outcome.row.id) ? 'already_liked' : 'pending',
        spotifyTrackId: outcome.match?.spotifyTrackId ?? null,
        spotifyTrackName: outcome.match?.name ?? null,
        spotifyArtistNames: outcome.match?.artistNames ?? null,
        spotifyAlbumName: outcome.match?.albumName ?? null,
        spotifyImageUrl: outcome.match?.imageUrl ?? null,
        spotifyExternalUrl: outcome.match?.externalUrl ?? null,
        spotifyDurationMs: outcome.match?.durationMs ?? null,
        matchScore: outcome.match?.score ?? null,
        candidates: outcome.match?.candidates ?? [],
      }),
    );

    res.json({
      ok: true,
      lovedFetched: mirror.fetched,
      lovedNew: mirror.added,
      searched: searched.length,
      items,
      remaining: await lovedMatchRepo.countUnsearched(spotifyUserId, session.username),
    });
  } catch (err) {
    next(err);
  }
});

likedSyncRouter.post('/apply', async (req, res, next) => {
  try {
    const { spotifyUserId } = req.user!;
    const { confirm = [], reject = [] } = req.body as {
      confirm?: Array<{ id: string; spotifyTrackId?: string }>;
      reject?: string[];
    };

    if (!Array.isArray(confirm) || !Array.isArray(reject)) {
      res.status(400).json({ error: 'confirm and reject must be arrays' });
      return;
    }
    if (confirm.length === 0 && reject.length === 0) {
      res.status(400).json({ error: 'Nothing to apply' });
      return;
    }
    if (confirm.length > MAX_APPLY_ITEMS) {
      res.status(400).json({ error: `confirm accepts at most ${MAX_APPLY_ITEMS} items` });
      return;
    }

    const token = await tokenRepo.getBySpotifyUserId(spotifyUserId);
    if (!token) {
      res.status(401).json({ error: 'Not authenticated with Spotify' });
      return;
    }
    if (confirm.length > 0 && !hasLibraryScopes(token.scope)) {
      res.status(403).json({ error: 'Spotify library access not granted — reconnect Spotify' });
      return;
    }

    const failed: Array<{ id: string; reason: string }> = [];
    const rows = await lovedMatchRepo.getByIds(confirm.map((c) => c.id), spotifyUserId);
    const rowsById = new Map(rows.map((row) => [row.id, row]));

    // Resolve what to save, honouring an alternate only if the server itself
    // proposed it — never trust a client-supplied track id outright.
    const targets: Array<{ id: string; spotifyTrackId: string }> = [];
    for (const entry of confirm) {
      const row = rowsById.get(String(entry.id));
      if (!row) {
        failed.push({ id: String(entry.id), reason: 'Unknown match' });
        continue;
      }
      const chosen = entry.spotifyTrackId;
      if (chosen && !row.candidates.some((c) => c.spotifyTrackId === chosen)) {
        failed.push({ id: row.id, reason: 'Chosen track was not one of the proposed candidates' });
        continue;
      }
      const trackId = chosen ?? row.spotifyTrackId;
      if (!trackId) {
        failed.push({ id: row.id, reason: 'No match to apply' });
        continue;
      }
      targets.push({ id: row.id, spotifyTrackId: trackId });
    }

    let liked = 0;
    if (targets.length > 0) {
      const uniqueTrackIds = [...new Set(targets.map((t) => t.spotifyTrackId))];
      const accessToken = await getValidToken(token);

      // Write to Spotify before recording it. The reverse order would mark
      // rows synced that were never saved; this way the worst case is a
      // re-confirm, and saving is idempotent.
      const result = await saveTracks(accessToken, uniqueTrackIds);

      const savedIds = new Set(result.saved);
      const succeeded = targets.filter((t) => savedIds.has(t.spotifyTrackId));
      await lovedMatchRepo.markSynced(succeeded, 'synced');
      liked = succeeded.length;

      for (const failure of result.failed) {
        const failedIds = new Set(failure.trackIds);
        for (const target of targets.filter((t) => failedIds.has(t.spotifyTrackId))) {
          failed.push({ id: target.id, reason: failure.reason });
        }
      }
    }

    const rejectIds = reject.map(String);
    if (rejectIds.length > 0) {
      await lovedMatchRepo.markStatus(rejectIds, 'rejected');
    }

    res.json({ ok: true, liked, rejected: rejectIds.length, failed });
  } catch (err) {
    next(err);
  }
});
