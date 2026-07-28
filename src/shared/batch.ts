/** Split an array into consecutive slices of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunk size must be at least 1, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Run `worker` over every item with at most `concurrency` in flight, returning
 * results in input order.
 *
 * A worker that rejects aborts the whole run, so callers wanting per-item
 * error handling should catch inside the worker and return a result object.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (concurrency < 1) throw new Error(`concurrency must be at least 1, got ${concurrency}`);
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (let index = cursor++; index < items.length; index = cursor++) {
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
