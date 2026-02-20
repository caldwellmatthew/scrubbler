import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../../shared/config';
import { exchangeCode } from '../../shared/spotify/auth';
import { fetchUserProfile } from '../../shared/spotify/client';
import * as tokenRepo from '../../shared/repositories/tokenRepo';

export const authRouter = Router();

// In-memory state store with 10-minute TTL
// Stores both expiry and the redirect_uri used at login time
interface StateEntry {
  expiry: number;
  redirectUri: string;
}
const pendingStates = new Map<string, StateEntry>();
const STATE_TTL_MS = 10 * 60 * 1000;

function generateState(redirectUri: string): string {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { expiry: Date.now() + STATE_TTL_MS, redirectUri });
  return state;
}

function consumeState(state: string): string | null {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  return Date.now() < entry.expiry ? entry.redirectUri : null;
}

// Periodically clean up expired states
setInterval(() => {
  const now = Date.now();
  for (const [state, entry] of pendingStates.entries()) {
    if (now >= entry.expiry) pendingStates.delete(state);
  }
}, STATE_TTL_MS);

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SCOPES = ['user-read-recently-played', 'user-read-private', 'user-read-email'].join(' ');

authRouter.get('/status', async (_req, res, next) => {
  try {
    const token = await tokenRepo.getFirst();
    if (token) {
      res.json({
        authenticated: true,
        displayName: token.displayName,
        spotifyUserId: token.spotifyUserId,
      });
    } else {
      res.json({ authenticated: false });
    }
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (_req, res, next) => {
  try {
    await tokenRepo.deleteAll();
    console.log('[auth] User logged out');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/login', (req, res) => {
  const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
  const state = generateState(redirectUri);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.spotifyClientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  res.redirect(`${SPOTIFY_AUTH_URL}?${params.toString()}`);
});

authRouter.get('/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;

    if (error) {
      res.status(400).json({ error: `Spotify denied authorization: ${error}` });
      return;
    }

    const redirectUri = state ? consumeState(state) : null;
    if (!redirectUri) {
      res.status(400).json({ error: 'Invalid or expired OAuth state parameter' });
      return;
    }

    if (!code) {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    const tokenSet = await exchangeCode(code, redirectUri);

    // Fetch the Spotify user profile to get their user ID
    const profile = await fetchUserProfile(tokenSet.accessToken);

    await tokenRepo.upsertToken(
      profile.id,
      profile.display_name ?? null,
      tokenSet.accessToken,
      tokenSet.refreshToken,
      tokenSet.expiresAt,
    );

    console.log(`[auth] Successfully authenticated Spotify user: ${profile.id}`);

    res.redirect('/');
  } catch (err) {
    next(err);
  }
});
