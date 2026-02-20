import { config } from '../shared/config';
import { poll } from './poller';

console.log(`[worker] Starting polling worker (interval=${config.pollIntervalMs}ms)`);

// Run immediately on startup, then on every interval
async function runPoll(): Promise<void> {
  try {
    await poll();
  } catch (err) {
    console.error('[worker] Poll failed:', err);
  }
}

runPoll();
setInterval(runPoll, config.pollIntervalMs);
