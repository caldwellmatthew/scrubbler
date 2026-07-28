import { describe, expect, it } from 'vitest';
import { LIBRARY_SCOPES, SPOTIFY_SCOPES, hasLibraryScopes, missingLibraryScopes } from './scopes';

describe('hasLibraryScopes', () => {
  it('rejects an unknown grant', () => {
    expect(hasLibraryScopes(null)).toBe(false);
  });

  it('rejects an empty grant', () => {
    expect(hasLibraryScopes('')).toBe(false);
    expect(hasLibraryScopes('   ')).toBe(false);
  });

  it('rejects a grant with only one of the two library scopes', () => {
    expect(hasLibraryScopes('user-read-private user-library-read')).toBe(false);
    expect(hasLibraryScopes('user-read-private user-library-modify')).toBe(false);
  });

  it('accepts a grant with both library scopes', () => {
    expect(hasLibraryScopes('user-read-private user-library-read user-library-modify')).toBe(true);
  });

  it('accepts the full requested scope list', () => {
    expect(hasLibraryScopes(SPOTIFY_SCOPES.join(' '))).toBe(true);
  });

  it('tolerates irregular whitespace between scopes', () => {
    expect(hasLibraryScopes('  user-library-read \n user-library-modify  ')).toBe(true);
  });

  // A substring check would accept these; scopes are compared as exact tokens.
  it('does not accept a scope that merely contains a library scope name', () => {
    expect(hasLibraryScopes('user-library-read-x user-library-modify-x')).toBe(false);
    expect(hasLibraryScopes('xuser-library-read xuser-library-modify')).toBe(false);
  });
});

describe('missingLibraryScopes', () => {
  it('lists both scopes when nothing is granted', () => {
    expect(missingLibraryScopes(null)).toEqual(LIBRARY_SCOPES);
  });

  it('lists only the absent scope', () => {
    expect(missingLibraryScopes('user-library-read')).toEqual(['user-library-modify']);
  });

  it('is empty when both are granted', () => {
    expect(missingLibraryScopes('user-library-read user-library-modify')).toEqual([]);
  });
});
