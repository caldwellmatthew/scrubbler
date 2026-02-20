import { Router } from 'express';
import { getPollState, setPollEnabled } from '../../shared/repositories/historyRepo';

export const pollRouter = Router();

pollRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await getPollState());
  } catch (err) {
    next(err);
  }
});

pollRouter.post('/start', async (_req, res, next) => {
  try {
    await setPollEnabled(true);
    res.json({ pollEnabled: true });
  } catch (err) {
    next(err);
  }
});

pollRouter.post('/stop', async (_req, res, next) => {
  try {
    await setPollEnabled(false);
    res.json({ pollEnabled: false });
  } catch (err) {
    next(err);
  }
});
