import express from 'express';
import { config } from '../shared/config';
import { authRouter } from './routes/auth';
import { historyRouter } from './routes/history';
import { pollRouter } from './routes/poll';
import { uiRouter } from './routes/ui';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/', uiRouter);
app.use('/auth', authRouter);
app.use('/history', historyRouter);
app.use('/poll', pollRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[server] Listening on http://localhost:${config.port}`);
  console.log(`[server] OAuth login: http://localhost:${config.port}/auth/login`);
});

export default app;
