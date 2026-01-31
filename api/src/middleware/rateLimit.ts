import type { Context, Next } from "hono";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
export const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > 60_000) {
      store.delete(key);
    }
  }
}, 60_000);

function getClientKey(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    (c.env?.incoming as { socket?: { remoteAddress?: string } })?.socket?.remoteAddress ??
    "unknown"
  );
}

export function rateLimit(maxRequests: number = 100) {
  return async (c: Context, next: Next) => {
    const key = getClientKey(c);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now - entry.windowStart > 60_000) {
      store.set(key, { count: 1, windowStart: now });
      return next();
    }

    entry.count++;
    if (entry.count > maxRequests) {
      return c.json(
        { error: "Rate limit exceeded", retryAfter: Math.ceil((entry.windowStart + 60_000 - now) / 1000) },
        429
      );
    }

    return next();
  };
}
