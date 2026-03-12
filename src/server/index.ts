import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from '../shared/config';
import { authRouter } from './routes/auth';
import { historyRouter } from './routes/history';
import { pollRouter } from './routes/poll';
import { explorerRouter } from './routes/explorer';
import { lastfmRouter } from './routes/lastfm';
import { nowPlayingRouter } from './routes/nowPlaying';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/auth';
import { checkConnection, dbErrorMessage } from '../shared/db';

const app = express();

app.use(express.json());
app.use(cookieParser(config.oauthStateSecret));

// Health check
app.get('/health', async (_req, res) => {
  try {
    await checkConnection();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', error: 'Database unavailable', timestamp: new Date().toISOString() });
  }
});

// Auth routes (no auth required — handles login/callback/status/logout)
app.use('/auth', authRouter);

// Protected routes
app.use('/now-playing', requireAuth, nowPlayingRouter);
app.use('/history', requireAuth, historyRouter);
app.use('/poll', requireAuth, pollRouter);
app.use('/explorer', requireAuth, explorerRouter);
app.use('/lastfm', requireAuth, lastfmRouter);

// Production: serve Vite-built client
if (process.env.NODE_ENV === 'production') {
  const clientDir = path.join(__dirname, '../client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

// 404 handler (only reached in dev or for unknown API paths)
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

checkConnection()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`[server] Listening on http://localhost:${config.port}`);
      console.log(`[server] OAuth login: http://localhost:${config.port}/auth/login`);
    });
  })
  .catch((err) => {
    console.error(`[server] Failed to connect to database: ${dbErrorMessage(err)}`);
    console.error('[server] Is PostgreSQL running? Check DATABASE_URL in your .env');
    process.exit(1);
  });

export default app;
