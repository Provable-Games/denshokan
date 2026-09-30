import type { MiddlewareHandler } from "hono";
import { compress } from "hono/compress";

const compressors = {
  gzip: compress({ encoding: "gzip" }),
  deflate: compress({ encoding: "deflate" }),
};

function acceptedEncoding(header: string | undefined): "gzip" | "deflate" | undefined {
  const qualities = new Map<string, number>();
  for (const item of (header ?? "").split(",")) {
    const [name, ...params] = item.trim().toLowerCase().split(";");
    const qParam = params.find((param) => /^\s*q\s*=/.test(param));
    const q = qParam === undefined ? 1 : Number(qParam.split("=")[1]?.trim());
    qualities.set(name.trim(), Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0);
  }
  const identity = qualities.get("identity") ?? 0;
  return (["gzip", "deflate"] as const)
    .map((encoding) => ({ encoding, q: qualities.get(encoding) ?? qualities.get("*") ?? 0 }))
    .filter(({ q }) => q > 0 && q >= identity)
    .sort((a, b) => b.q - a.q)[0]?.encoding;
}

/** Compress before traffic leaves the API container, rather than at the edge. */
export const compressApiJson: MiddlewareHandler = async (c, next) => {
  if (c.req.path === "/health" || c.req.path === "/ws") {
    await next();
    return;
  }
  // The locked Hono middleware ignores q-values unless given an encoding.
  // Negotiate first so a client rejecting gzip never receives gzip.
  const encoding = acceptedEncoding(c.req.header("Accept-Encoding"));
  if (encoding) await compressors[encoding](c, next);
  else await next();
  if (c.res.headers.get("Content-Type")?.startsWith("application/json")) {
    // Also vary the uncompressed response: caches must respect negotiation.
    c.header("Vary", "Accept-Encoding", { append: true });
  }
};
