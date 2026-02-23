import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

const lastfmEnabled = !!(process.env['LASTFM_API_KEY'] && process.env['LASTFM_API_SECRET']);

export const config = {
  spotifyClientId: requireEnv('SPOTIFY_CLIENT_ID'),
  spotifyClientSecret: requireEnv('SPOTIFY_CLIENT_SECRET'),
  databaseUrl: requireEnv('DATABASE_URL'),
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  pollIntervalMs: parseInt(optionalEnv('POLL_INTERVAL_MS', '60000'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  lastfmApiKey: optionalEnv('LASTFM_API_KEY', ''),
  lastfmApiSecret: optionalEnv('LASTFM_API_SECRET', ''),
  lastfmEnabled,
};
