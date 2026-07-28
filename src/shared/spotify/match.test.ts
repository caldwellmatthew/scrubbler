import { describe, expect, it } from 'vitest';
import type { SpotifyTrack } from '../types';
import {
  buildSearchQuery,
  confidenceTier,
  diceCoefficient,
  normalizeForMatch,
  rankCandidates,
  scoreCandidate,
} from './match';

function makeTrack(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return {
    id: 'track-1',
    uri: 'spotify:track:track-1',
    name: 'Xtal',
    artists: [{ id: 'artist-1', name: 'Aphex Twin' }],
    album: { id: 'album-1', name: 'Selected Ambient Works 85-92', images: [] },
    duration_ms: 293_000,
    external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
    preview_url: null,
    ...overrides,
  };
}

const loved = { artist: 'Aphex Twin', track: 'Xtal' };

describe('normalizeForMatch', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeForMatch('  Weird   FISHES  ')).toBe('weird fishes');
  });

  it('strips diacritics', () => {
    expect(normalizeForMatch('Björk', { clean: false })).toBe('bjork');
    expect(normalizeForMatch('Sigur Rós', { clean: false })).toBe('sigur ros');
    expect(normalizeForMatch('Beyoncé', { clean: false })).toBe('beyonce');
  });

  it('expands & to "and"', () => {
    expect(normalizeForMatch('Hall & Oates', { clean: false })).toBe('hall and oates');
    expect(normalizeForMatch('Hall and Oates', { clean: false })).toBe('hall and oates');
  });

  it('drops punctuation', () => {
    expect(normalizeForMatch('Mr. Brightside')).toBe('mr brightside');
  });

  it('normalizes curly and straight apostrophes identically', () => {
    expect(normalizeForMatch('Don’t Stop')).toBe(normalizeForMatch("Don't Stop"));
  });

  it('drops a leading article', () => {
    expect(normalizeForMatch('The Beatles', { clean: false })).toBe('beatles');
    expect(normalizeForMatch('Beatles', { clean: false })).toBe('beatles');
  });

  it('keeps a bare "the"', () => {
    expect(normalizeForMatch('The', { clean: false })).toBe('the');
  });

  it('strips every feature-credit form', () => {
    expect(normalizeForMatch('Slow Jamz (feat. Jamie Foxx)')).toBe('slow jamz');
    expect(normalizeForMatch('Slow Jamz [feat. Jamie Foxx]')).toBe('slow jamz');
    expect(normalizeForMatch('Slow Jamz feat. Jamie Foxx')).toBe('slow jamz');
    expect(normalizeForMatch('Slow Jamz ft. Jamie Foxx')).toBe('slow jamz');
    expect(normalizeForMatch('Slow Jamz featuring Jamie Foxx')).toBe('slow jamz');
  });

  // The feature-credit pattern must not treat "with" as a credit marker.
  it('leaves "with" alone', () => {
    expect(normalizeForMatch('Sleeping with Sirens', { clean: false })).toBe('sleeping with sirens');
    expect(normalizeForMatch('Dance with Me')).toBe('dance with me');
  });

  it('leaves a title that merely starts with a credit word alone', () => {
    expect(normalizeForMatch('Ft. Lauderdale')).toBe('ft lauderdale');
  });

  it('inherits cleanName release-metadata stripping', () => {
    expect(normalizeForMatch('Song - 2011 Remaster')).toBe('song');
    expect(normalizeForMatch('Song (Remastered 2009)')).toBe('song');
  });

  it('skips cleanName when asked', () => {
    expect(normalizeForMatch('Song (Live)', { clean: false })).toBe('song live');
    expect(normalizeForMatch('Song (Live)')).toBe('song');
  });

  it('maps empty input to empty output', () => {
    expect(normalizeForMatch('')).toBe('');
  });

  // An ASCII-only strip erased these entirely, which both hid them from
  // matching and made any two of them compare as identical.
  it('preserves non-Latin scripts', () => {
    expect(normalizeForMatch('細野晴臣', { clean: false })).toBe('細野晴臣');
    expect(normalizeForMatch('矢野顕子', { clean: false })).toBe('矢野顕子');
    expect(normalizeForMatch('Кино', { clean: false })).toBe('кино');
    expect(normalizeForMatch('한대수', { clean: false })).toBe('한대수');
  });

  it('still strips punctuation around non-Latin text', () => {
    expect(normalizeForMatch('コズミック・サーフィン', { clean: false })).toBe('コズミックサーフィン');
    expect(normalizeForMatch('君に、胸キュン。', { clean: false })).toBe('君に胸キュン');
  });

  it('distinguishes different non-Latin strings', () => {
    expect(normalizeForMatch('細野晴臣', { clean: false })).not.toBe(
      normalizeForMatch('矢野顕子', { clean: false }),
    );
  });
});

describe('diceCoefficient', () => {
  it('scores identical strings 1', () => {
    expect(diceCoefficient('xtal', 'xtal')).toBe(1);
  });

  it('scores disjoint strings 0', () => {
    expect(diceCoefficient('abcd', 'wxyz')).toBe(0);
  });

  it('treats both-empty as identical and one-empty as disjoint', () => {
    expect(diceCoefficient('', '')).toBe(1);
    expect(diceCoefficient('', 'abc')).toBe(0);
  });

  it('handles strings shorter than one bigram', () => {
    expect(diceCoefficient('a', 'a')).toBe(1);
    expect(diceCoefficient('a', 'b')).toBe(0);
  });

  it('is symmetric', () => {
    expect(diceCoefficient('night', 'nacht')).toBe(diceCoefficient('nacht', 'night'));
  });

  it('scores the canonical night/nacht pair at 0.25', () => {
    expect(diceCoefficient('night', 'nacht')).toBeCloseTo(0.25, 10);
  });

  // A set-based implementation collapses both to {"aa"} and returns 1.
  it('counts repeated bigrams as a multiset', () => {
    expect(diceCoefficient('aaaa', 'aa')).toBeLessThan(1);
  });
});

describe('scoreCandidate', () => {
  it('scores an exact artist and title match 1', () => {
    expect(scoreCandidate(loved, makeTrack()).score).toBe(1);
  });

  it('still scores 1 when only Spotify carries a remaster suffix', () => {
    const result = scoreCandidate(loved, makeTrack({ name: 'Xtal - 2008 Remaster' }));
    expect(result.disqualified).toBe(false);
    expect(result.score).toBe(1);
  });

  it('disqualifies a different artist with the same title', () => {
    const result = scoreCandidate(loved, makeTrack({ artists: [{ id: 'x', name: 'Wagon Christ' }] }));
    expect(result.disqualified).toBe(true);
  });

  it('disqualifies a different title by the same artist', () => {
    expect(scoreCandidate(loved, makeTrack({ name: 'Ageispolis' })).disqualified).toBe(true);
  });

  // Last.fm gives one artist; on a collaboration it may not be Spotify's first.
  it('matches the Last.fm artist against any credited artist', () => {
    const result = scoreCandidate(
      { artist: 'Kali Uchis', track: 'After The Storm' },
      makeTrack({
        name: 'After The Storm',
        artists: [
          { id: 'a', name: 'Tyler, The Creator' },
          { id: 'b', name: 'Kali Uchis' },
        ],
      }),
    );
    expect(result.disqualified).toBe(false);
    expect(result.score).toBe(1);
    expect(result.artistScore).toBe(1);
    expect(result.primaryArtistScore).toBeLessThan(1);
  });

  it('disqualifies a karaoke version the user did not ask for', () => {
    expect(
      scoreCandidate(loved, makeTrack({ album: { id: 'k', name: 'Karaoke Hits', images: [] } })).disqualified,
    ).toBe(true);
    expect(
      scoreCandidate(loved, makeTrack({ name: 'Xtal (Karaoke Version)' })).disqualified,
    ).toBe(true);
    expect(
      scoreCandidate(loved, makeTrack({ artists: [{ id: 't', name: 'Aphex Twin Tribute Band' }] })).disqualified,
    ).toBe(true);
  });

  it('allows a karaoke match when the loved track is itself karaoke', () => {
    const result = scoreCandidate(
      { artist: 'Aphex Twin', track: 'Xtal (Karaoke Version)' },
      makeTrack({ name: 'Xtal (Karaoke Version)' }),
    );
    expect(result.disqualified).toBe(false);
  });

  it('matches a non-Latin title against itself', () => {
    const result = scoreCandidate(
      { artist: '細野晴臣', track: 'Sports Men' },
      makeTrack({ name: 'Sports Men', artists: [{ id: 'h', name: '細野晴臣' }] }),
    );
    expect(result.disqualified).toBe(false);
    expect(result.score).toBe(1);
  });

  // Both sides used to normalize to "" and score a perfect, meaningless 1.
  it('does not match two unrelated non-Latin titles', () => {
    const result = scoreCandidate(
      { artist: '細野晴臣', track: 'コズミック・サーフィン' },
      makeTrack({ name: '君に、胸キュン。', artists: [{ id: 'y', name: '矢野顕子' }] }),
    );
    expect(result.disqualified).toBe(true);
  });

  it('disqualifies a candidate whose title is all punctuation', () => {
    const result = scoreCandidate(loved, makeTrack({ name: '!!!' }));
    expect(result.disqualified).toBe(true);
  });

  it('penalizes a live version when the loved track is not live', () => {
    const result = scoreCandidate(loved, makeTrack({ name: 'Xtal (Live)' }));
    expect(result.disqualified).toBe(false);
    expect(result.score).toBeCloseTo(0.85, 10);
  });

  it('does not penalize when both sides are live', () => {
    const result = scoreCandidate(
      { artist: 'Aphex Twin', track: 'Xtal (Live)' },
      makeTrack({ name: 'Xtal (Live)' }),
    );
    expect(result.score).toBe(1);
  });
});

describe('confidenceTier', () => {
  it('places scores in the right tier at each boundary', () => {
    expect(confidenceTier(1)).toBe('high');
    expect(confidenceTier(0.9)).toBe('high');
    expect(confidenceTier(0.899)).toBe('medium');
    expect(confidenceTier(0.7)).toBe('medium');
    expect(confidenceTier(0.699)).toBe('low');
    expect(confidenceTier(0.55)).toBe('low');
    expect(confidenceTier(0.549)).toBeNull();
    expect(confidenceTier(0)).toBeNull();
  });
});

describe('rankCandidates', () => {
  it('returns null when nothing is acceptable', () => {
    expect(rankCandidates(loved, [])).toBeNull();
    expect(rankCandidates(loved, [makeTrack({ name: 'Completely Different' })])).toBeNull();
  });

  it('returns null when the only candidates are karaoke versions', () => {
    const karaoke = makeTrack({ id: 'k1', name: 'Xtal', album: { id: 'k', name: 'Karaoke Hits', images: [] } });
    expect(rankCandidates(loved, [karaoke])).toBeNull();
  });

  it('picks the highest scorer and caps alternates at two', () => {
    const result = rankCandidates(loved, [
      makeTrack({ id: 'a', name: 'Xtal (Live)' }),
      makeTrack({ id: 'b', name: 'Xtal' }),
      makeTrack({ id: 'c', name: 'Xtal - 2008 Remaster' }),
      makeTrack({ id: 'd', name: 'Xtal - Radio Edit' }),
    ]);
    expect(result?.best.track.id).toBe('b');
    expect(result?.alternates).toHaveLength(2);
    expect(result?.confidence).toBe('high');
  });

  it('prefers the plainest title among equally scored candidates', () => {
    const result = rankCandidates(loved, [
      makeTrack({ id: 'suffixed', name: 'Xtal (Remastered)' }),
      makeTrack({ id: 'plain', name: 'Xtal' }),
    ]);
    expect(result?.best.track.id).toBe('plain');
    expect(result?.ambiguous).toBe(false);
  });

  it('does not flag same-artist ties as ambiguous', () => {
    const result = rankCandidates(loved, [
      makeTrack({ id: 'album', album: { id: '1', name: 'Selected Ambient Works 85-92', images: [] } }),
      makeTrack({ id: 'comp', album: { id: '2', name: 'Classics', images: [] } }),
    ]);
    expect(result?.ambiguous).toBe(false);
    expect(result?.confidence).toBe('high');
  });

  // A near-tie between different primary artists is an original-vs-cover call.
  it('flags a near-tie between different artists and downgrades it', () => {
    const result = rankCandidates({ artist: 'Nine Inch Nails', track: 'Hurt' }, [
      makeTrack({ id: 'nin', name: 'Hurt', artists: [{ id: '1', name: 'Nine Inch Nails' }] }),
      makeTrack({ id: 'cash', name: 'Hurt', artists: [{ id: '2', name: 'Nine Inch Nails' }] }),
    ]);
    expect(result?.ambiguous).toBe(false);

    const covered = rankCandidates({ artist: 'Nine Inch Nails', track: 'Hurt' }, [
      makeTrack({ id: 'nin', name: 'Hurt', artists: [{ id: '1', name: 'Nine Inch Nails' }] }),
      makeTrack({ id: 'nine', name: 'Hurt', artists: [{ id: '2', name: 'Nine Inch Nail' }] }),
    ]);
    expect(covered?.ambiguous).toBe(true);
    expect(covered?.confidence).toBe('medium');
  });

  it('returns the same result for the same input', () => {
    const tracks = [
      makeTrack({ id: 'c', name: 'Xtal' }),
      makeTrack({ id: 'a', name: 'Xtal' }),
      makeTrack({ id: 'b', name: 'Xtal' }),
    ];
    expect(rankCandidates(loved, tracks)).toEqual(rankCandidates(loved, tracks));
  });

  // Spotify's ordering is a relevance signal, so it settles otherwise-equal
  // candidates rather than falling through to something arbitrary.
  it('falls back to Spotify result order for otherwise-equal candidates', () => {
    const result = rankCandidates(loved, [
      makeTrack({ id: 'first', name: 'Xtal' }),
      makeTrack({ id: 'second', name: 'Xtal' }),
    ]);
    expect(result?.best.track.id).toBe('first');
  });
});

describe('buildSearchQuery', () => {
  it('field-filters the primary query', () => {
    const { primary } = buildSearchQuery('Aphex Twin', 'Xtal');
    expect(primary).toBe('track:"Xtal" artist:"Aphex Twin"');
  });

  it('drops field filters from the fallback', () => {
    const { fallback } = buildSearchQuery('Aphex Twin', 'Xtal');
    expect(fallback).toBe('Xtal Aphex Twin');
    expect(fallback).not.toContain('track:');
  });

  it('strips quotes that would unbalance the phrase', () => {
    const { primary } = buildSearchQuery('The "Band"', 'A "Quoted" Title');
    expect(primary).toBe('track:"A Quoted Title" artist:"The Band"');
  });

  it('applies cleanName to the track but not the artist', () => {
    const { primary } = buildSearchQuery('Live', 'Song - 2011 Remaster');
    expect(primary).toBe('track:"Song" artist:"Live"');
  });

  it('falls back to the raw title when cleanName empties it', () => {
    const { primary } = buildSearchQuery('Some Artist', '(Live)');
    expect(primary).toBe('track:"(Live)" artist:"Some Artist"');
  });
});
