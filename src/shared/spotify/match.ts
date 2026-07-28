import { cleanName } from '../lastfm/clean';
import type { SpotifyTrack } from '../types';

// Last.fm loved tracks carry only an artist and a title — no album, no
// duration, no usable MBID — so those are the only two signals available here.
export interface LovedRef {
  artist: string;
  track: string;
}

export type ConfidenceTier = 'high' | 'medium' | 'low';

export interface CandidateScore {
  score: number;
  titleScore: number;
  artistScore: number;
  primaryArtistScore: number;
  disqualified: boolean;
}

export interface ScoredCandidate {
  track: SpotifyTrack;
  score: number;
}

export interface MatchResult {
  best: ScoredCandidate;
  alternates: ScoredCandidate[];
  confidence: ConfidenceTier;
  ambiguous: boolean;
}

// A wrong artist is far worse than no match — it silently adds someone else's
// song to the library — so artist similarity is a hard gate, not just a weight.
const ARTIST_FLOOR = 0.5;
const TITLE_FLOOR = 0.5;
const TITLE_WEIGHT = 0.6;
const ARTIST_WEIGHT = 0.4;

// Applied when only one side is marked live. Soft, because loved-track titles
// routinely omit the suffix the Spotify release carries.
const LIVE_PENALTY = 0.85;

const HIGH_THRESHOLD = 0.9;
const MEDIUM_THRESHOLD = 0.7;
const LOW_THRESHOLD = 0.55;

// Two near-identical scores from *different* primary artists means we probably
// found a cover; same-artist ties are just the usual album/single/compilation
// spread and are resolved by the tie-breakers instead.
const AMBIGUITY_EPSILON = 0.02;

const MAX_CANDIDATES = 3;

const COMBINING = /[\u0300-\u036f]/g;
// Requires a space or opening bracket before the marker, so a title that
// legitimately starts with one ("Ft. Lauderdale") is left alone. Deliberately
// excludes "with", which would eat "Sleeping with Sirens".
const FEATURE_CREDIT = /[\s([]+(?:feat|ft|featuring)\b\.?\s.*$/;
// Strips punctuation and symbols while keeping letters, digits, and combining
// marks from every script. An ASCII-only class would erase CJK titles
// entirely, which both hides them from matching and makes any two of them
// compare as identical. Marks are kept because outside Latin they carry
// meaning — dropping a Japanese dakuten turns ズ into ス.
const NON_ALPHANUMERIC = /[^\p{L}\p{N}\p{M}\s]/gu;
const LEADING_ARTICLE = /^the\s+/;
const KARAOKE = /karaoke|tribute|made popular by|originally performed by|in the style of|cover version/i;
const LIVE = /\blive\b/i;

/**
 * Reduce a title or artist to a comparable form.
 *
 * `cleanName` runs first for titles, which is the single biggest match-rate
 * win — it lets "Song - 2011 Remaster" match "Song". It also collapses
 * "Song (Live)" into "Song", so the live/studio distinction is reintroduced
 * separately as a penalty computed from the raw strings.
 *
 * Pass `{ clean: false }` for artist names: `cleanName` targets release
 * metadata and is never applied to artists elsewhere in the codebase.
 */
export function normalizeForMatch(s: string, opts: { clean?: boolean } = {}): string {
  const cleaned = opts.clean === false ? s : cleanName(s);
  return cleaned
    // Decompose only to drop Latin diacritics, then recompose: leaving the
    // string decomposed splits Hangul into jamo and detaches Japanese voicing
    // marks from their kana.
    .normalize('NFKD')
    .replace(COMBINING, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(FEATURE_CREDIT, '')
    .replace(/&/g, ' and ')
    .replace(NON_ALPHANUMERIC, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING_ARTICLE, '');
}

function bigrams(s: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const gram = s.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/**
 * Sørensen–Dice similarity over character bigrams, in [0, 1].
 *
 * Bigrams are counted as a multiset rather than a set: with a set, "aaa" and
 * "aa" both reduce to {"aa"} and score a perfect 1.
 */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const left = bigrams(a);
  const right = bigrams(b);

  let shared = 0;
  for (const [gram, count] of left) {
    const other = right.get(gram);
    if (other !== undefined) shared += Math.min(count, other);
  }

  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

function normalizedArtists(track: SpotifyTrack): string[] {
  return track.artists.map((a) => normalizeForMatch(a.name, { clean: false }));
}

export function scoreCandidate(loved: LovedRef, track: SpotifyTrack): CandidateScore {
  const lovedTitle = normalizeForMatch(loved.track);
  const lovedArtist = normalizeForMatch(loved.artist, { clean: false });
  const candidateTitle = normalizeForMatch(track.name);
  const candidateArtists = normalizedArtists(track);

  const titleScore = diceCoefficient(lovedTitle, candidateTitle);

  // Max over all credited artists: Last.fm supplies one name, and on a
  // collaboration it may be the featured artist rather than the primary.
  const artistScores = candidateArtists.map((name) => diceCoefficient(lovedArtist, name));
  const artistScore = artistScores.length > 0 ? Math.max(...artistScores) : 0;
  const primaryArtistScore = artistScores[0] ?? 0;

  const lovedRaw = `${loved.track} ${loved.artist}`;
  const candidateRaw = `${track.name} ${track.album.name} ${track.artists.map((a) => a.name).join(' ')}`;
  // Only a guard when the user didn't ask for it — someone who loved a karaoke
  // track should still be able to match one.
  const karaoke = KARAOKE.test(candidateRaw) && !KARAOKE.test(lovedRaw);

  // A side that normalizes away entirely carries no signal, and two such sides
  // would otherwise compare as a perfect match.
  const noSignal = lovedTitle === '' || candidateTitle === '' || lovedArtist === '';

  if (noSignal || karaoke || artistScore < ARTIST_FLOOR || titleScore < TITLE_FLOOR) {
    return { score: 0, titleScore, artistScore, primaryArtistScore, disqualified: true };
  }

  const exact = lovedTitle === candidateTitle && candidateArtists.includes(lovedArtist);
  let score = exact ? 1 : TITLE_WEIGHT * titleScore + ARTIST_WEIGHT * artistScore;

  if (LIVE.test(loved.track) !== LIVE.test(track.name)) {
    score *= LIVE_PENALTY;
  }

  return { score, titleScore, artistScore, primaryArtistScore, disqualified: false };
}

export function confidenceTier(score: number): ConfidenceTier | null {
  if (score >= HIGH_THRESHOLD) return 'high';
  if (score >= MEDIUM_THRESHOLD) return 'medium';
  if (score >= LOW_THRESHOLD) return 'low';
  return null;
}

function hasQualifierSuffix(name: string): boolean {
  return /[([]/.test(name);
}

/**
 * Pick the best Spotify track for a loved track, plus runner-ups for the
 * review UI's alternate-version picker. Returns null when nothing clears the
 * disqualifiers and the minimum score — that is a genuine "no match", not an
 * invitation to promote the least-bad option.
 */
export function rankCandidates(loved: LovedRef, tracks: SpotifyTrack[]): MatchResult | null {
  const scored = tracks
    .map((track, index) => ({ track, index, ...scoreCandidate(loved, track) }))
    .filter((c) => !c.disqualified && confidenceTier(c.score) !== null);

  if (scored.length === 0) return null;

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      // Prefer the release where the Last.fm artist is the primary credit.
      b.primaryArtistScore - a.primaryArtistScore ||
      // Then the plainest title — no "(...)"/"[...]" qualifier.
      Number(hasQualifierSuffix(a.track.name)) - Number(hasQualifierSuffix(b.track.name)) ||
      // Finally Spotify's own relevance ordering. Positions are unique, so this
      // is a total order and no further tie-breaker can be reached.
      a.index - b.index,
  );

  const [best, ...rest] = scored;
  const runnerUp = rest[0];
  const ambiguous =
    runnerUp !== undefined &&
    best.score - runnerUp.score <= AMBIGUITY_EPSILON &&
    normalizedArtists(best.track)[0] !== normalizedArtists(runnerUp.track)[0];

  let confidence = confidenceTier(best.score) as ConfidenceTier;
  if (ambiguous && confidence === 'high') confidence = 'medium';

  return {
    best: { track: best.track, score: best.score },
    alternates: rest.slice(0, MAX_CANDIDATES - 1).map((c) => ({ track: c.track, score: c.score })),
    confidence,
    ambiguous,
  };
}

/**
 * Build the Spotify search queries for a loved track.
 *
 * Uses `cleanName` output rather than the aggressive normalizer: Spotify's
 * search already handles case and diacritics, and stripping punctuation hurts
 * (it turns "Mr. Brightside" into "mr brightside"). Quotes are removed because
 * one inside a field filter produces an unbalanced phrase and a 400.
 *
 * The fallback drops the field filters entirely, for the cases where Spotify's
 * metadata doesn't line up with Last.fm's well enough for a filtered match.
 */
export function buildSearchQuery(artist: string, track: string): { primary: string; fallback: string } {
  const stripQuotes = (s: string) => s.replace(/"/g, '').trim();
  const title = stripQuotes(cleanName(track)) || stripQuotes(track);
  const performer = stripQuotes(artist);

  return {
    primary: `track:"${title}" artist:"${performer}"`,
    fallback: `${title} ${performer}`.trim(),
  };
}
