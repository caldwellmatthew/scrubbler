import { describe, expect, it } from 'vitest';
import type { ListenHistoryRow } from '../types';
import { buildNowPlayingPayload, buildScrobbleItems } from './scrobble';

function makeRow(overrides: Partial<ListenHistoryRow> = {}): ListenHistoryRow {
  return {
    id: '1',
    spotifyTrackId: 'track-1',
    spotifyUserId: 'user-1',
    playedAt: new Date('2026-01-01T12:00:00.000Z'),
    name: 'Song (Remastered)',
    artistName: 'The Band',
    albumName: 'The Album (Deluxe Edition)',
    durationMs: 180_000,
    externalUrl: null,
    previewUrl: null,
    imageUrl: null,
    scrobbledAt: null,
    scrobbleSanitized: null,
    ...overrides,
  };
}

describe('buildScrobbleItems', () => {
  it('sanitizes track and album by default', () => {
    const [item] = buildScrobbleItems([makeRow()]);
    expect(item.track).toBe('Song');
    expect(item.album).toBe('The Album');
  });

  it('leaves track and album untouched when sanitize is false', () => {
    const [item] = buildScrobbleItems([makeRow()], { sanitize: false });
    expect(item.track).toBe('Song (Remastered)');
    expect(item.album).toBe('The Album (Deluxe Edition)');
  });

  it('uses the first comma-separated artist', () => {
    const [item] = buildScrobbleItems([makeRow({ artistName: 'A, B, C' })]);
    expect(item.artist).toBe('A');
  });

  it('converts playedAt to a unix-seconds timestamp', () => {
    const [item] = buildScrobbleItems([
      makeRow({ playedAt: new Date('2026-01-01T12:00:00.000Z') }),
    ]);
    expect(item.timestamp).toBe(Math.floor(Date.UTC(2026, 0, 1, 12, 0, 0) / 1000));
  });

  it('converts durationMs to integer seconds', () => {
    const [item] = buildScrobbleItems([makeRow({ durationMs: 180_500 })]);
    expect(item.duration).toBe(180);
  });

  it('per-row overrides take precedence over both raw and sanitized values', () => {
    const rows = [makeRow({ id: '42' })];
    const [item] = buildScrobbleItems(rows, {
      overrides: { '42': { track: 'Custom Track', album: 'Custom Album' } },
    });
    expect(item.track).toBe('Custom Track');
    expect(item.album).toBe('Custom Album');
  });

  it('overriding only the track still sanitizes the album', () => {
    const rows = [makeRow({ id: '42' })];
    const [item] = buildScrobbleItems(rows, {
      overrides: { '42': { track: 'Custom Track' } },
    });
    expect(item.track).toBe('Custom Track');
    expect(item.album).toBe('The Album');
  });

  it('overrides still apply when sanitize is false', () => {
    const rows = [makeRow({ id: '42' })];
    const [item] = buildScrobbleItems(rows, {
      sanitize: false,
      overrides: { '42': { album: 'Custom Album' } },
    });
    expect(item.track).toBe('Song (Remastered)');
    expect(item.album).toBe('Custom Album');
  });
});

describe('buildNowPlayingPayload', () => {
  const track = {
    name: 'Song (Remastered)',
    artists: [{ name: 'Primary' }, { name: 'Featured' }],
    album: { name: 'The Album (Deluxe Edition)' },
    duration_ms: 180_500,
  };

  it('sanitizes track and album when sanitize is true', () => {
    const payload = buildNowPlayingPayload(track, true);
    expect(payload.track).toBe('Song');
    expect(payload.album).toBe('The Album');
  });

  it('leaves track and album untouched when sanitize is false', () => {
    const payload = buildNowPlayingPayload(track, false);
    expect(payload.track).toBe('Song (Remastered)');
    expect(payload.album).toBe('The Album (Deluxe Edition)');
  });

  it('uses the first artist in the array', () => {
    const payload = buildNowPlayingPayload(track, true);
    expect(payload.artist).toBe('Primary');
  });

  it('converts duration_ms to integer seconds', () => {
    const payload = buildNowPlayingPayload(track, true);
    expect(payload.duration).toBe(180);
  });
});
