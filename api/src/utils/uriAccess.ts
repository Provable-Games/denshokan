import type { Context } from "hono";

import { getCaller } from "../middleware/apiKey.js";

/**
 * Access control for the `tokenUri` blob (~40 KB of base64 SVG per token).
 *
 * Serving it to every caller by default was ~83% of this project's Railway bill
 * — 1.5 TB of egress in 16 days, peaking at 338 GB/day. Two things bound it now:
 *
 *   1. On list endpoints it is opt-in (`?include_uri=true` / `{ includeUri: true }`)
 *      rather than opt-out. A caller that says nothing gets ~1 KB/token — still
 *      the dominant cost at high poll rates, which is what the API-key tiers in
 *      `middleware/apiKey.ts` and the rate limits in `middleware/rateLimit.ts`
 *      are for.
 *   2. Even an explicit request only gets the URI if the caller presents a
 *      valid API key, or its `Origin` is in `URI_ALLOWED_ORIGINS`.
 *
 * `URI_ALLOWED_ORIGINS` is a comma-separated origin list:
 *
 *   URI_ALLOWED_ORIGINS=https://denshokan.gg,https://www.denshokan.gg
 *
 * Leave it unset to allow every origin — existing deployments keep working
 * until an operator opts in. A literal `*` entry means the same thing.
 *
 * Caveat worth knowing before relying on this: `Origin` is attached by browsers,
 * not by servers. A scripted client can omit or forge it. This caps egress from
 * browser apps and casual crawlers; it is NOT an authentication boundary — see
 * `middleware/apiKey.ts` for that. The allowlist remains the path for browser
 * apps, which cannot hold a secret anyway.
 *
 * SDK compatibility: denshokan-sdk ≤0.1.39 signals "I want URIs" by sending no
 * `include_uri` param at all and relying on the old server-default-includes
 * behaviour (`include_uri: params?.includeUri ? undefined : "false"`). Against
 * the opt-in default those callers get no URI from the API and fall back to the
 * SDK's on-chain `tokenUriBatch` — art still renders, but over RPC. SDK ≥0.1.40
 * should send `include_uri=true` explicitly to keep it on HTTP.
 */

function parseOriginList(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return items.includes("*") ? null : items;
}

const uriAllowlist = parseOriginList(process.env.URI_ALLOWED_ORIGINS);

/** True when `origin` may receive tokenUri payloads. */
export function isUriOriginAllowed(origin: string | undefined): boolean {
  // Unset (or `*`) — unrestricted, preserving pre-allowlist behaviour.
  if (uriAllowlist === null) return true;
  // Allowlist configured but the caller sent no Origin (server-to-server, curl).
  // Those are exactly the bulk consumers the allowlist exists to exclude.
  if (!origin) return false;
  return uriAllowlist.includes(origin);
}

/**
 * Resolve whether this request should receive tokenUri, given what it asked for.
 *
 * A valid API key satisfies this on its own. That is the authentication
 * boundary the caveat above asks for: a keyed caller is a known consumer with
 * its own rate-limit budget, so it does not also need to be a browser on an
 * allowlisted origin. Anonymous callers still fall back to the Origin check.
 *
 * When a caller asks but qualifies under neither we omit the field rather
 * than failing the request — the rest of the payload is still useful — and set
 * `X-Token-Uri-Omitted` so the omission is visible in devtools instead of
 * looking like missing data.
 */
export function resolveUriAccess(c: Context, requested: boolean): boolean {
  if (!requested) return false;
  if (getCaller(c).tier === "keyed") return true;
  const origin = c.req.header("Origin");
  if (isUriOriginAllowed(origin)) return true;
  c.header("X-Token-Uri-Omitted", "origin-not-allowed");
  return false;
}

/** Logged once at boot so the active policy is visible in deploy logs. */
export function describeUriPolicy(): string {
  return uriAllowlist === null
    ? "tokenUri: unrestricted (set URI_ALLOWED_ORIGINS to limit egress)"
    : `tokenUri: restricted to ${uriAllowlist.join(", ")}`;
}
