import type { ErrorRequestHandler } from 'express';
import { isDbConnectionError, dbErrorMessage } from '../../shared/db';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (isDbConnectionError(err)) {
    console.error('[server] Database connection error:', dbErrorMessage(err));
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const status: number = (err as { status?: number }).status ?? 500;
  const message: string = err instanceof Error ? err.message : 'Internal server error';

  if (status >= 500) {
    console.error('[server] Unhandled error:', err);
  }

  res.status(status).json({ error: message });
};
