import { createHash } from "node:crypto";
import type { Context, Next } from "hono";

/**
 * API key identification.
 *
 * The Origin allowlist in `uriAccess.ts` caps egress from browser apps, but as
 * that file notes, `Origin` is attached by browsers and a scripted client can
 * omit or forge it. This is the authentication boundary it points at: a caller
 * that presents a valid key is a known consumer and gets a larger budget;
 * everyone else gets the anonymous one.
 *
 * `API_KEYS` is a comma-separated list. Each entry is either a bare secret or
 * `label:secret`, where the label appears in logs and rate-limit buckets so a
 * noisy consumer is identifiable:
 *
 *   API_KEYS=beasts:sk_live_abc123,warden:sk_live_def456
 *
 * A label must not contain `:` — everything after the first colon is the
 * secret. Unset means no key is ever valid and every caller is anonymous,
 * so existing deployments keep working until an operator opts in.
 *
 * Keys are compared by SHA-256 digest, so the raw secrets are not held in a
 * lookup structure and a wrong key costs the same work as a right one. Use
 * high-entropy random secrets: this stops bulk scraping, not online guessing
 * of a weak key.
 */

export type CallerTier = "keyed" | "anonymous";

export interface CallerIdentity {
  tier: CallerTier;
  /** Label from `API_KEYS`, or null for anonymous callers. */
  label: string | null;
  /** Stable short id for the key — safe to log; null when anonymous. */
  keyId: string | null;
}

const ANONYMOUS: CallerIdentity = { tier: "anonymous", label: null, keyId: null };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseKeys(raw: string | undefined): Map<string, string> {
  const byDigest = new Map<string, string>();
  if (!raw) return byDigest;
  for (const entry of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const sep = entry.indexOf(":");
    const label = sep > 0 ? entry.slice(0, sep) : "unnamed";
    const secret = sep > 0 ? entry.slice(sep + 1) : entry;
    if (secret) byDigest.set(sha256(secret), label);
  }
  return byDigest;
}

const keyLabels = parseKeys(process.env.API_KEYS);

/** `X-API-Key: <secret>` or `Authorization: Bearer <secret>`. */
function presentedKey(c: Context): string | null {
  const header = c.req.header("X-API-Key");
  if (header) return header.trim();
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

/**
 * Identify the caller and attach it to the context as `caller`.
 *
 * A missing key is not an error — it is the anonymous tier. A key that is
 * present but unrecognised is rejected with 401 rather than silently demoted,
 * so a consumer with a typo'd or rotated-out key finds out immediately instead
 * of quietly running into the anonymous rate limit.
 */
export async function identifyCaller(c: Context, next: Next) {
  const presented = presentedKey(c);
  if (!presented) {
    c.set("caller", ANONYMOUS);
    return next();
  }

  const digest = sha256(presented);
  const label = keyLabels.get(digest);
  if (!label) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  c.set("caller", { tier: "keyed", label, keyId: digest.slice(0, 12) });
  return next();
}

/** Caller for this request; anonymous when the middleware has not run. */
export function getCaller(c: Context): CallerIdentity {
  return (c.get("caller") as CallerIdentity | undefined) ?? ANONYMOUS;
}

/** Logged once at boot so the active policy is visible in deploy logs. */
export function describeKeyPolicy(): string {
  if (keyLabels.size === 0) {
    return "API keys: none configured (all callers anonymous; set API_KEYS to grant higher limits)";
  }
  const labels = [...new Set(keyLabels.values())].sort();
  return `API keys: ${keyLabels.size} active (${labels.join(", ")})`;
}
