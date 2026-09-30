import assert from "node:assert/strict";
import { test } from "node:test";
import { gunzipSync, inflateSync } from "node:zlib";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { tokens } from "../src/db/schema.js";
import { compressApiJson } from "../src/middleware/compress.js";
import { selectTokenColumns } from "../src/utils/tokenSelection.js";

const payload = {
  data: Array.from({ length: 500 }, (_, i) => ({
    tokenId: String(i), currentScore: "1600", gameOver: true,
    ownerAddress: "0x1234", minterAddress: "0x5678",
  })),
  total: 500,
};

function app() {
  const api = new Hono();
  api.use("*", cors({ origin: ["https://denshokan.gg"] }));
  api.use("*", compressApiJson);
  api.post("/tokens/query", (c) => c.json(payload));
  api.get("/health", (c) => c.json({ status: "ok" }));
  api.get("/ws", (c) => c.json(payload));
  api.get("/untouched", (c) => {
    c.header("Cache-Control", "no-transform");
    return c.json(payload);
  });
  return api;
}

test("bulk JSON is gzip compressed without changing its decoded payload", async () => {
  const res = await app().request("/tokens/query", {
    method: "POST",
    headers: { "Accept-Encoding": "gzip, deflate", Origin: "https://denshokan.gg" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Encoding"), "gzip");
  assert.match(res.headers.get("Vary") ?? "", /Accept-Encoding/i);
  assert.match(res.headers.get("Vary") ?? "", /Origin/i);
  const wire = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(JSON.parse(gunzipSync(wire).toString()), payload);
  assert.ok(wire.length < Buffer.byteLength(JSON.stringify(payload)) / 4);
});

test("clients that request deflate receive a decodable response", async () => {
  const res = await app().request("/tokens/query", {
    method: "POST", headers: { "Accept-Encoding": "deflate" },
  });
  assert.equal(res.headers.get("Content-Encoding"), "deflate");
  assert.deepEqual(JSON.parse(inflateSync(Buffer.from(await res.arrayBuffer())).toString()), payload);
});

test("clients without compression support still receive plain JSON and a Vary header", async () => {
  for (const encoding of [undefined, "identity"]) {
    const res = await app().request("/tokens/query", {
      method: "POST", headers: encoding ? { "Accept-Encoding": encoding } : {},
    });
    assert.equal(res.headers.get("Content-Encoding"), null);
    assert.match(res.headers.get("Vary") ?? "", /Accept-Encoding/i);
    assert.deepEqual(await res.json(), payload);
  }
});

test("health, WebSocket and no-transform responses bypass compression", async () => {
  for (const path of ["/health", "/ws", "/untouched"]) {
    const res = await app().request(path, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(res.headers.get("Content-Encoding"), null);
    assert.equal(res.status, 200);
  }
});

test("list SQL does not read token_uri when artwork is omitted", () => {
  const db = drizzle.mock();
  const query = db.select(selectTokenColumns(false)).from(tokens).toSQL();
  assert.doesNotMatch(query.sql, /"token_uri"/);
  assert.match(query.sql, /NULL/);
  for (const column of ["token_id", "current_score", "owner_address", "game_over"]) {
    assert.ok(query.sql.includes(`"${column}"`), column);
  }
});

test("list SQL still reads artwork when the request is authorized", () => {
  const db = drizzle.mock();
  const query = db.select(selectTokenColumns(true)).from(tokens).toSQL();
  assert.match(query.sql, /"token_uri"/);
});
