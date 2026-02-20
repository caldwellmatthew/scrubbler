import { getPool } from '../db';
import type { OAuthToken } from '../types';

function rowToToken(row: Record<string, unknown>): OAuthToken {
  return {
    id: row.id as number,
    spotifyUserId: row.spotify_user_id as string,
    accessToken: row.access_token as string,
    refreshToken: row.refresh_token as string,
    expiresAt: row.expires_at as Date,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function upsertToken(
  spotifyUserId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
): Promise<OAuthToken> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO oauth_tokens (spotify_user_id, access_token, refresh_token, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (spotify_user_id) DO UPDATE SET
       access_token  = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at    = EXCLUDED.expires_at,
       updated_at    = NOW()
     RETURNING *`,
    [spotifyUserId, accessToken, refreshToken, expiresAt],
  );
  return rowToToken(result.rows[0]);
}

export async function getFirst(): Promise<OAuthToken | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM oauth_tokens LIMIT 1');
  return result.rows.length > 0 ? rowToToken(result.rows[0]) : null;
}

export async function updateTokens(
  spotifyUserId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE oauth_tokens
     SET access_token = $2, refresh_token = $3, expires_at = $4, updated_at = NOW()
     WHERE spotify_user_id = $1`,
    [spotifyUserId, accessToken, refreshToken, expiresAt],
  );
}
