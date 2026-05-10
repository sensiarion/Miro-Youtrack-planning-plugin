import { MIN_SYNC_CONCURRENCY, MAX_SYNC_CONCURRENCY } from '../constants';

export function clampConcurrency(n: number): number {
  if (!Number.isFinite(n)) return MIN_SYNC_CONCURRENCY;
  return Math.max(MIN_SYNC_CONCURRENCY, Math.min(MAX_SYNC_CONCURRENCY, Math.floor(n)));
}

/**
 * Run `fn(item, index)` over `items` with at most `limit` concurrent calls.
 * Preserves input order in the result array.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  if (items.length === 0) return results;
  const concurrency = clampConcurrency(limit);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
