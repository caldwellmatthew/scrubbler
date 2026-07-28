import { getPool } from '../db';
import type { OAuthToken } from '../types';

function rowToToken(row: Record<string, unknown>): OAuthToken {
  return {
    id: row.id as number,
    spotifyUserId: row.spotify_user_id as string,
    displayName: row.display_name as string | null,
    accessToken: row.access_token as string,
    refreshToken: row.refresh_token as string,
    expiresAt: row.expires_at as Date,
    scope: (row.scope as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function upsertToken(
  spotifyUserId: string,
  displayName: string | null,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  scope: string,
): Promise<OAuthToken> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO oauth_tokens (spotify_user_id, display_name, access_token, refresh_token, expires_at, scope, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (spotify_user_id) DO UPDATE SET
       display_name  = EXCLUDED.display_name,
       access_token  = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at    = EXCLUDED.expires_at,
       scope         = EXCLUDED.scope,
       updated_at    = NOW()
     RETURNING *`,
    [spotifyUserId, displayName, accessToken, refreshToken, expiresAt, scope],
  );
  return rowToToken(result.rows[0]);
}

export async function getBySpotifyUserId(spotifyUserId: string): Promise<OAuthToken | null> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM oauth_tokens WHERE spotify_user_id = $1', [spotifyUserId]);
  return result.rows.length > 0 ? rowToToken(result.rows[0]) : null;
}

export async function getAll(): Promise<OAuthToken[]> {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM oauth_tokens');
  return result.rows.map(rowToToken);
}

export async function deleteBySpotifyUserId(spotifyUserId: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM oauth_tokens WHERE spotify_user_id = $1', [spotifyUserId]);
}

export async function updateTokens(
  spotifyUserId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  // Optional so callers that don't have it don't clobber the recorded grant.
  scope?: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE oauth_tokens
     SET access_token = $2, refresh_token = $3, expires_at = $4,
         scope = COALESCE($5, oauth_tokens.scope), updated_at = NOW()
     WHERE spotify_user_id = $1`,
    [spotifyUserId, accessToken, refreshToken, expiresAt, scope ?? null],
  );
}
