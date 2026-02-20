import { Router } from 'express';
import { queryHistory } from '../../shared/repositories/historyRepo';
import type { HistoryQueryParams } from '../../shared/types';

export const historyRouter = Router();

historyRouter.get('/', async (req, res, next) => {
  try {
    const query = req.query as Record<string, string | undefined>;

    const params: HistoryQueryParams = {
      limit: query.limit !== undefined ? parseInt(query.limit, 10) : 50,
      offset: query.offset !== undefined ? parseInt(query.offset, 10) : 0,
      before: query.before,
      after: query.after,
      track_id: query.track_id,
    };

    if (
      params.limit !== undefined &&
      (isNaN(params.limit) || params.limit < 1 || params.limit > 200)
    ) {
      res.status(400).json({ error: 'limit must be an integer between 1 and 200' });
      return;
    }

    if (params.offset !== undefined && (isNaN(params.offset) || params.offset < 0)) {
      res.status(400).json({ error: 'offset must be a non-negative integer' });
      return;
    }

    if (params.before && isNaN(Date.parse(params.before))) {
      res.status(400).json({ error: 'before must be a valid ISO date string' });
      return;
    }

    if (params.after && isNaN(Date.parse(params.after))) {
      res.status(400).json({ error: 'after must be a valid ISO date string' });
      return;
    }

    const rows = await queryHistory(params);

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        playedAt: row.playedAt,
        spotifyUserId: row.spotifyUserId,
        track: {
          spotifyTrackId: row.spotifyTrackId,
          name: row.name,
          artistName: row.artistName,
          albumName: row.albumName,
          durationMs: row.durationMs,
          externalUrl: row.externalUrl,
          previewUrl: row.previewUrl,
          imageUrl: row.imageUrl,
        },
      })),
      count: rows.length,
      limit: params.limit,
      offset: params.offset,
    });
  } catch (err) {
    next(err);
  }
});
