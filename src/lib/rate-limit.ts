import "server-only";
import { prisma } from "@/lib/db";

// Fixed-window counters stored in PostgreSQL, so limits survive restarts and are shared by
// every app instance (the app container itself keeps no state).

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };
type Blocked = Extract<RateLimitResult, { ok: false }>;

export function firstBlocked(results: RateLimitResult[]): Blocked | undefined {
  return results.find((result): result is Blocked => !result.ok);
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMs);

  // One atomic statement: start a new window if the old one ended, otherwise count the hit.
  const [row] = await prisma.$queryRaw<{ hits: number; reset_at: Date }[]>`
    INSERT INTO rate_limits (key, hits, reset_at)
    VALUES (${key}, 1, ${windowEnd})
    ON CONFLICT (key) DO UPDATE SET
      hits     = CASE WHEN rate_limits.reset_at <= ${now} THEN 1 ELSE rate_limits.hits + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= ${now} THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
    RETURNING hits, reset_at`;

  if (Math.random() < 0.01) {
    await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
  }

  if (row.hits <= limit) return { ok: true };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((row.reset_at.getTime() - now.getTime()) / 1000)) };
}

export async function clearRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

export function formatRetryAfter(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "a minute" : `${minutes} minutes`;
}
