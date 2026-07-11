import { describe, expect, it, vi } from 'vitest';
import { parseScrobbleResults } from './client';

function scrobbleEntry(code: string, text = '') {
  return {
    artist: { corrected: '0', '#text': 'The Band' },
    track: { corrected: '0', '#text': 'Song' },
    ignoredMessage: { code, '#text': text },
    timestamp: '1767268800',
  };
}

describe('parseScrobbleResults', () => {
  it('treats code 0 as accepted', () => {
    const data = { scrobbles: { scrobble: scrobbleEntry('0'), '@attr': { accepted: 1, ignored: 0 } } };
    expect(parseScrobbleResults(data, 1)).toEqual([{ accepted: true, ignoredReason: null }]);
  });

  it('handles a single-item response returned as a bare object', () => {
    const data = { scrobbles: { scrobble: scrobbleEntry('1'), '@attr': { accepted: 0, ignored: 1 } } };
    const [result] = parseScrobbleResults(data, 1);
    expect(result.accepted).toBe(false);
  });

  it('maps ignored entries in a batch to their positions', () => {
    const data = {
      scrobbles: {
        scrobble: [scrobbleEntry('0'), scrobbleEntry('2'), scrobbleEntry('0')],
        '@attr': { accepted: 2, ignored: 1 },
      },
    };
    const results = parseScrobbleResults(data, 3);
    expect(results.map((r) => r.accepted)).toEqual([true, false, true]);
  });

  it('prefers the response message text when present', () => {
    const data = { scrobbles: { scrobble: scrobbleEntry('3', 'Timestamp was too old') } };
    expect(parseScrobbleResults(data, 1)[0].ignoredReason).toBe('Timestamp was too old');
  });

  it('falls back to a mapped reason when message text is empty', () => {
    const data = { scrobbles: { scrobble: scrobbleEntry('2') } };
    expect(parseScrobbleResults(data, 1)[0].ignoredReason).toMatch(/ignored by Last\.fm/i);
  });

  it('describes unknown codes rather than dropping them', () => {
    const data = { scrobbles: { scrobble: scrobbleEntry('99') } };
    const [result] = parseScrobbleResults(data, 1);
    expect(result.accepted).toBe(false);
    expect(result.ignoredReason).toContain('99');
  });

  it('assumes accepted when the response shape is unrecognized', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(parseScrobbleResults({}, 2)).toEqual([
        { accepted: true, ignoredReason: null },
        { accepted: true, ignoredReason: null },
      ]);
      expect(parseScrobbleResults({ scrobbles: { scrobble: [scrobbleEntry('0')] } }, 2)).toHaveLength(2);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
