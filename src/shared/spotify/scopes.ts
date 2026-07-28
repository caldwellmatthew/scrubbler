// Scopes requested at login. Spotify only grants scopes through a fresh
// authorization-code flow — refreshing a token never widens them — so adding
// to this list requires every existing user to reconnect.
export const SPOTIFY_SCOPES = [
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'user-library-modify',
];

// Reading and writing Spotify's saved-tracks library.
export const LIBRARY_SCOPES = ['user-library-read', 'user-library-modify'];

/**
 * Parse a space-delimited granted-scope string into a set of exact scope names.
 * Substring matching is wrong here — 'user-library-read-x' must not satisfy
 * 'user-library-read' — so callers compare set membership, never `includes`.
 */
function grantedSet(granted: string | null): Set<string> {
  if (!granted) return new Set();
  return new Set(granted.trim().split(/\s+/).filter(Boolean));
}

export function missingLibraryScopes(granted: string | null): string[] {
  const have = grantedSet(granted);
  return LIBRARY_SCOPES.filter((scope) => !have.has(scope));
}

export function hasLibraryScopes(granted: string | null): boolean {
  return missingLibraryScopes(granted).length === 0;
}
