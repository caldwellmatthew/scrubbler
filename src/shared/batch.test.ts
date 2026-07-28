import { describe, expect, it } from 'vitest';
import { chunk, mapWithConcurrency } from './batch';

describe('chunk', () => {
  it('splits evenly when the size divides the length', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('puts the remainder in a final short slice', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one slice when the size exceeds the length', () => {
    expect(chunk([1, 2], 40)).toEqual([[1, 2]]);
  });

  it('returns nothing for an empty input', () => {
    expect(chunk([], 40)).toEqual([]);
  });

  it('supports a size of 1', () => {
    expect(chunk([1, 2], 1)).toEqual([[1], [2]]);
  });

  it('rejects a size below 1', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('mapWithConcurrency', () => {
  it('returns results in input order', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it('preserves order even when later items finish first', async () => {
    const out = await mapWithConcurrency([30, 20, 10], 3, async (delay) => {
      await new Promise((r) => setTimeout(r, delay));
      return delay;
    });
    expect(out).toEqual([30, 20, 10]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('visits every item exactly once', async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('handles an empty input', async () => {
    expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([]);
  });

  it('propagates a worker rejection', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });
});
