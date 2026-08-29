import type { Context, Next } from "hono";
import { getCaller } from "./apiKey.js";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000;

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
export const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > WINDOW_MS) {
      store.delete(key);
    }
  }
}, WINDOW_MS);

function getClientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    (c.env?.incoming as { socket?: { remoteAddress?: string } })?.socket?.remoteAddress ??
    "unknown"
  );
}

/**
 * Budget for this request, and the bucket it draws from.
 *
 * Anonymous callers are bucketed by IP, which is all we have — and it is weak,
 * since a client can rotate IPs to multiply its ceiling. Keyed callers are
 * bucketed by key instead, so one consumer has one budget no matter how many
 * instances or IPs it runs behind, and a noisy one is identifiable by label.
 */
function resolveBucket(c: Context, limits: RateLimitTiers) {
  const caller = getCaller(c);
  if (caller.tier === "keyed") {
    return { key: `key:${caller.keyId}`, limit: limits.keyed };
  }
  return { key: `ip:${getClientIp(c)}`, limit: limits.anonymous };
}

export interface RateLimitTiers {
  /** Per-minute budget for callers with no API key, bucketed by IP. */
  anonymous: number;
  /** Per-minute budget for a valid API key, bucketed by key. */
  keyed: number;
}

/**
 * Fixed-window per-minute rate limit, split by caller tier.
 *
 * Caveat worth knowing: the window state is an in-process `Map`. It resets on
 * every deploy and is not shared between replicas, so the effective ceiling is
 * `limit × replicas`. That is fine for shaping honest traffic; move the store
 * to Postgres or Redis before treating these numbers as a hard cap.
 */
export function rateLimit(limits: RateLimitTiers | number) {
  const tiers: RateLimitTiers =
    typeof limits === "number" ? { anonymous: limits, keyed: limits } : limits;

  return async (c: Context, next: Next) => {
    const { key, limit } = resolveBucket(c, tiers);
    const now = Date.now();
    const entry = store.get(key);
    const fresh = !entry || now - entry.windowStart > WINDOW_MS;

    const current = fresh ? { count: 1, windowStart: now } : entry!;
    if (fresh) {
      store.set(key, current);
    } else {
      current.count++;
    }

    const resetSeconds = Math.ceil((current.windowStart + WINDOW_MS - now) / 1000);
    // Advertise the budget so a well-behaved poller can pace itself instead of
    // discovering the limit by being refused.
    c.header("RateLimit-Limit", String(limit));
    c.header("RateLimit-Remaining", String(Math.max(0, limit - current.count)));
    c.header("RateLimit-Reset", String(resetSeconds));

    if (current.count > limit) {
      c.header("Retry-After", String(resetSeconds));
      return c.json(
        { error: "Rate limit exceeded", retryAfter: resetSeconds },
        429,
      );
    }

    return next();
  };
}
