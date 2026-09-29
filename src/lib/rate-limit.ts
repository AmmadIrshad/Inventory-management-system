import "server-only";

type Bucket = { count: number; resetAt: number };

// In-process fixed-window limiter. Good for a single container; move to Redis/Postgres
// before running more than one app instance.
const globalForRateLimit = globalThis as unknown as { rateLimitBuckets?: Map<string, Bucket> };
const buckets = (globalForRateLimit.rateLimitBuckets ??= new Map());

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  bucket.count += 1;
  if (bucket.count <= limit) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

export function formatRetryAfter(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
