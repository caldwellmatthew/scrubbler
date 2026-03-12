import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../../shared/config';
import { exchangeCode } from '../../shared/spotify/auth';
import { fetchUserProfile } from '../../shared/spotify/client';
import * as tokenRepo from '../../shared/repositories/tokenRepo';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

// In-memory state store with 10-minute TTL
// Stores both expiry and the redirect_uri used at login time
interface StateEntry {
  expiry: number;
  redirectUri: string;
}
const pendingStates = new Map<string, StateEntry>();
const STATE_TTL_MS = 10 * 60 * 1000;

// One-time tokens for cross-origin dev auth handoff
const pendingOTTs = new Map<string, { spotifyUserId: string; expiry: number }>();
const OTT_TTL_MS = 60 * 1000;

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
const SCOPES = ['user-read-recently-played', 'user-read-currently-playing', 'user-read-playback-state', 'user-read-private', 'user-read-email'].join(' ');

const COOKIE_OPTIONS = {
  httpOnly: true,
  signed: true,
  sameSite: 'lax' as const,
  secure: config.nodeEnv === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

authRouter.get('/status', async (req, res, next) => {
  try {
    const uid = req.signedCookies?.uid as string | undefined;
    if (!uid) {
      res.json({ authenticated: false });
      return;
    }
    const token = await tokenRepo.getBySpotifyUserId(uid);
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

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await tokenRepo.deleteBySpotifyUserId(req.user!.spotifyUserId);
    const { maxAge: _, ...clearOptions } = COOKIE_OPTIONS;
    res.clearCookie('uid', clearOptions);
    console.log('[auth] User logged out:', req.user!.spotifyUserId);
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

    if (config.clientOrigin) {
      // Dev: hand off via one-time token so the cookie is set through the Vite proxy
      // (avoids cookie domain mismatch between 127.0.0.1:3000 and localhost:5173)
      const ott = crypto.randomBytes(16).toString('hex');
      pendingOTTs.set(ott, { spotifyUserId: profile.id, expiry: Date.now() + OTT_TTL_MS });
      res.redirect(`${config.clientOrigin}/?ott=${ott}`);
    } else {
      // Production: same origin, set cookie directly
      res.cookie('uid', profile.id, COOKIE_OPTIONS);
      res.redirect('/');
    }
  } catch (err) {
    next(err);
  }
});

authRouter.get('/finalize', (req, res) => {
  const ott = req.query.ott as string | undefined;
  if (!ott) { res.status(400).json({ error: 'Missing token' }); return; }
  const entry = pendingOTTs.get(ott);
  if (!entry || Date.now() > entry.expiry) {
    pendingOTTs.delete(ott);
    res.status(400).json({ error: 'Invalid or expired token' });
    return;
  }
  pendingOTTs.delete(ott);
  res.cookie('uid', entry.spotifyUserId, COOKIE_OPTIONS);
  res.json({ ok: true });
});
