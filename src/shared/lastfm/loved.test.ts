import { describe, expect, it } from 'vitest';
import { parseLovedTracksResponse } from './loved';

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Xtal',
    artist: { name: 'Aphex Twin', mbid: '', url: 'https://last.fm/…' },
    mbid: '',
    url: 'https://last.fm/…',
    date: { uts: '1700000000', '#text': '14 Nov 2023, 22:13' },
    ...overrides,
  };
}

function makeResponse(track: unknown, attr: Record<string, string> = {}) {
  return {
    lovedtracks: {
      track,
      '@attr': { user: 'someone', page: '1', perPage: '50', totalPages: '3', total: '117', ...attr },
    },
  };
}

describe('parseLovedTracksResponse', () => {
  it('parses a list of tracks', () => {
    const page = parseLovedTracksResponse(
      makeResponse([makeEntry(), makeEntry({ name: 'Ageispolis' })]),
    );
    expect(page.tracks).toHaveLength(2);
    expect(page.tracks[0]).toEqual({
      artist: 'Aphex Twin',
      track: 'Xtal',
      lovedAt: new Date(1_700_000_000_000),
    });
    expect(page.tracks[1].track).toBe('Ageispolis');
  });

  // Last.fm collapses a single-element list into a bare object.
  it('parses a single track returned as a bare object', () => {
    const page = parseLovedTracksResponse(makeResponse(makeEntry()));
    expect(page.tracks).toHaveLength(1);
    expect(page.tracks[0].track).toBe('Xtal');
  });

  it('returns an empty list when the user has no loved tracks', () => {
    const page = parseLovedTracksResponse(makeResponse(undefined, { total: '0', totalPages: '0' }));
    expect(page.tracks).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('returns an empty list for an unrecognized body', () => {
    expect(parseLovedTracksResponse({}).tracks).toEqual([]);
    expect(parseLovedTracksResponse(null).tracks).toEqual([]);
  });

  it('converts the string-typed @attr numbers', () => {
    const page = parseLovedTracksResponse(makeResponse([makeEntry()]));
    expect(page.total).toBe(117);
    expect(page.totalPages).toBe(3);
    expect(page.page).toBe(1);
  });

  it('falls back to the entry count when @attr is absent', () => {
    const page = parseLovedTracksResponse({ lovedtracks: { track: [makeEntry(), makeEntry()] } });
    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(1);
  });

  it('converts the uts timestamp from seconds to milliseconds', () => {
    const page = parseLovedTracksResponse(
      makeResponse([makeEntry({ date: { uts: '1000000000' } })]),
    );
    expect(page.tracks[0].lovedAt).toEqual(new Date('2001-09-09T01:46:40.000Z'));
  });

  it('yields a null date when the entry has none', () => {
    const page = parseLovedTracksResponse(makeResponse([makeEntry({ date: undefined })]));
    expect(page.tracks[0].lovedAt).toBeNull();
  });

  it('skips entries missing a track or artist name', () => {
    const page = parseLovedTracksResponse(
      makeResponse([
        makeEntry(),
        makeEntry({ name: undefined }),
        makeEntry({ artist: { name: undefined } }),
        makeEntry({ artist: undefined }),
      ]),
    );
    expect(page.tracks).toHaveLength(1);
  });
});
