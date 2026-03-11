import { Router } from 'express';
import { getPollState, setPollEnabled } from '../../shared/repositories/historyRepo';

export const pollRouter = Router();

pollRouter.get('/', async (req, res, next) => {
  try {
    res.json(await getPollState(req.user!.spotifyUserId));
  } catch (err) {
    next(err);
  }
});

pollRouter.post('/start', async (req, res, next) => {
  try {
    await setPollEnabled(req.user!.spotifyUserId, true);
    res.json({ pollEnabled: true });
  } catch (err) {
    next(err);
  }
});

pollRouter.post('/stop', async (req, res, next) => {
  try {
    await setPollEnabled(req.user!.spotifyUserId, false);
    res.json({ pollEnabled: false });
  } catch (err) {
    next(err);
  }
});
