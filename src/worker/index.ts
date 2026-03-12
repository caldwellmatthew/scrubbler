import { config } from '../shared/config';
import { checkConnection } from '../shared/db';
import { poll } from './poller';

async function runPoll(): Promise<void> {
  try {
    await poll();
  } catch (err) {
    console.error('[worker] Poll failed:', err);
  }
}

checkConnection()
  .then(() => {
    console.log(`[worker] Starting polling worker (interval=${config.pollIntervalMs}ms)`);
    runPoll();
    setInterval(runPoll, config.pollIntervalMs);
  })
  .catch((err) => {
    console.error(`[worker] Failed to connect to database: ${err instanceof Error ? err.message : err}`);
    console.error('[worker] Is PostgreSQL running? Check DATABASE_URL in your .env');
    process.exit(1);
  });
