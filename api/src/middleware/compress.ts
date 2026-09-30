import type { MiddlewareHandler } from "hono";
import { compress } from "hono/compress";

const compressResponse = compress();

/** Compress before traffic leaves the API container, rather than at the edge. */
export const compressApiJson: MiddlewareHandler = async (c, next) => {
  if (c.req.path === "/health" || c.req.path === "/ws") {
    await next();
    return;
  }
  await compressResponse(c, next);
  if (c.res.headers.get("Content-Type")?.startsWith("application/json")) {
    // Also vary the uncompressed response: caches must respect negotiation.
    c.header("Vary", "Accept-Encoding", { append: true });
  }
};
