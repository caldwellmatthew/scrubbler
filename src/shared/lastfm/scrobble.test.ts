import { describe, expect, it } from 'vitest';
import type { ListenHistoryRow } from '../types';
import { buildNowPlayingPayload, buildScrobbleItems, partitionDuplicatePlays } from './scrobble';

function makeRow(overrides: Partial<ListenHistoryRow> = {}): ListenHistoryRow {
  return {
    id: '1',
    spotifyTrackId: 'track-1',
    spotifyUserId: 'user-1',
    playedAt: new Date('2026-01-01T12:00:00.000Z'),
    name: 'Song (Remastered)',
    artistNames: ['The Band'],
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

describe('partitionDuplicatePlays', () => {
  const playedAt = new Date('2026-01-01T12:00:00.000Z');
  const secondsBefore = (n: number) => new Date(playedAt.getTime() - n * 1000);
  const scrobbledAt = (n: number) => ({ playedAt: secondsBefore(n), scrobbled: true });
  const unscrobbledAt = (n: number) => ({ playedAt: secondsBefore(n), scrobbled: false });

  it('keeps a play with no earlier play of the same track', () => {
    const row = makeRow({ playedAt });
    const { kept, duplicates } = partitionDuplicatePlays([row], new Map());
    expect(kept).toEqual([row]);
    expect(duplicates).toEqual([]);
  });

  it('drops a play repeating a scrobbled listen the track could not have finished', () => {
    const row = makeRow({ playedAt, durationMs: 180_000 });
    const prior = scrobbledAt(120);
    const { kept, duplicates } = partitionDuplicatePlays([row], new Map([[row.id, prior]]));
    expect(kept).toEqual([]);
    expect(duplicates).toEqual([{ row, priorPlayedAt: prior.playedAt }]);
  });

  it('keeps a play repeated after the track had time to finish', () => {
    const row = makeRow({ playedAt, durationMs: 180_000 });
    const { kept, duplicates } = partitionDuplicatePlays(
      [row],
      new Map([[row.id, scrobbledAt(240)]]),
    );
    expect(kept).toEqual([row]);
    expect(duplicates).toEqual([]);
  });

  it('keeps a play whose gap exactly equals the track duration', () => {
    const row = makeRow({ playedAt, durationMs: 180_000 });
    const { kept } = partitionDuplicatePlays([row], new Map([[row.id, scrobbledAt(180)]]));
    expect(kept).toEqual([row]);
  });

  it('keeps a play whose earlier listen was never scrobbled, so one scrobble results', () => {
    const row = makeRow({ playedAt, durationMs: 180_000 });
    const { kept, duplicates } = partitionDuplicatePlays(
      [row],
      new Map([[row.id, unscrobbledAt(120)]]),
    );
    expect(kept).toEqual([row]);
    expect(duplicates).toEqual([]);
  });

  it('collapses a run within one batch to a single scrobble', () => {
    const first = makeRow({ id: '1', playedAt: secondsBefore(300), durationMs: 180_000 });
    const second = makeRow({ id: '2', playedAt: secondsBefore(150), durationMs: 180_000 });
    const third = makeRow({ id: '3', playedAt, durationMs: 180_000 });
    const { kept, duplicates } = partitionDuplicatePlays([first, second, third], new Map());
    expect(kept).toEqual([first]);
    expect(duplicates.map((d) => d.row.id)).toEqual(['2', '3']);
  });

  it('orders a batch chronologically before deciding', () => {
    const first = makeRow({ id: '1', playedAt: secondsBefore(150), durationMs: 180_000 });
    const second = makeRow({ id: '2', playedAt, durationMs: 180_000 });
    const { kept, duplicates } = partitionDuplicatePlays([second, first], new Map());
    expect(kept).toEqual([first]);
    expect(duplicates.map((d) => d.row.id)).toEqual(['2']);
  });

  it('treats separate tracks independently', () => {
    const a = makeRow({ id: '1', spotifyTrackId: 'track-a', playedAt, durationMs: 180_000 });
    const b = makeRow({ id: '2', spotifyTrackId: 'track-b', playedAt, durationMs: 180_000 });
    const { kept } = partitionDuplicatePlays(
      [a, b],
      new Map([['1', scrobbledAt(120)]]),
    );
    expect(kept).toEqual([b]);
  });

  it('judges each play against its own track duration', () => {
    const short = makeRow({ id: '1', spotifyTrackId: 'a', playedAt, durationMs: 60_000 });
    const long = makeRow({ id: '2', spotifyTrackId: 'b', playedAt, durationMs: 600_000 });
    const { kept, duplicates } = partitionDuplicatePlays(
      [short, long],
      new Map([['1', scrobbledAt(120)], ['2', scrobbledAt(120)]]),
    );
    expect(kept).toEqual([short]);
    expect(duplicates.map((d) => d.row.id)).toEqual(['2']);
  });
});

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

  it('uses the primary artist, even when its name contains a comma', () => {
    const [item] = buildScrobbleItems([
      makeRow({ artistNames: ['Tyler, The Creator', 'Kali Uchis'] }),
    ]);
    expect(item.artist).toBe('Tyler, The Creator');
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
