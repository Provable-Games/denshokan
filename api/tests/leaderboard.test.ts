import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { db } from "../src/db/client.js";
import { createLeaderboardRouter } from "../src/routes/leaderboard.js";

const postgres = new PGlite();
const app = createLeaderboardRouter(drizzle(postgres) as unknown as typeof db);
const query = "/?game_address=0x1&minter_address=0xa&context_id=7";
const id = (prefix: bigint, block: bigint, suffix = 0n) =>
  ((prefix << 200n) | (block << 32n) | suffix).toString();

before(async () => {
  await postgres.exec(`
    CREATE TABLE tokens (token_id numeric, contract_address text, owner_address text,
      current_score bigint, context_id numeric, minted_by bigint);
    CREATE TABLE minters (minter_id bigint, token_contract_address text, contract_address text);
    INSERT INTO minters VALUES (1, '0x1', '0xa'), (1, '0x2', '0xb');
  `);
});
beforeEach(async () => { await postgres.exec("DELETE FROM tokens"); });
after(async () => { await postgres.close(); });

async function insert(tokenId: string, score: string, game = "0x1", context = "7") {
  await postgres.query("INSERT INTO tokens VALUES ($1, $2, '0xc', $3, $4, 1)",
    [tokenId, game, score, context]);
}
async function page(extra = "") {
  const response = await app.request(query + extra);
  assert.equal(response.status, 200);
  return response.json() as Promise<{ data: { tokenId: string; score: string; mintBlock: number }[]; total: number }>;
}

test("mint-block tiebreak is applied before limiting a large tied field", async () => {
  for (let i = 0; i < 30; i++) await insert(id(1n, 101n, BigInt(i)), "100");
  const oldest = id(2n, 100n);
  await insert(oldest, "100"); // Larger numeric ID, inserted outside the first page.
  const result = await page("&limit=1");
  assert.equal(result.total, 31);
  assert.deepEqual(result.data, [{ tokenId: oldest, score: "100", owner: "0xc", mintBlock: 100 }]);
});

test("same-block ties use full numeric token IDs across consecutive pages", async () => {
  const low = id(1n, 100n, 9n);
  const high = id(2n, 100n, 1n);
  await insert(high, "100");
  await insert(low, "100");
  assert.equal((await page("&limit=1")).data[0].tokenId, low);
  assert.equal((await page("&limit=1&offset=1")).data[0].tokenId, high);
});

test("unequal large scores remain distinct and outrank mint-block ties", async () => {
  const older = id(1n, 10n);
  const newer = id(1n, 20n);
  await insert(older, "9007199254740992");
  await insert(newer, "9007199254740993");
  const result = await page("&limit=1");
  assert.equal(result.data[0].tokenId, newer);
  assert.equal(result.data[0].score, "9007199254740993");
  assert.equal((await page("&sort_order=asc&limit=1")).data[0].tokenId, older);
});

test("query scopes the issuing game, minter and context and excludes zeros", async () => {
  const winner = id(1n, 10n);
  await insert(winner, "100");
  await insert(id(1n, 11n), "0");
  await insert(id(1n, 12n), "200", "0x2"); // Same minter ID, different issuer/minter.
  await insert(id(1n, 13n), "200", "0x1", "8");
  const result = await page();
  assert.equal(result.total, 1);
  assert.equal(result.data[0].tokenId, winner);
});

test("invalid or missing scope never returns an unfiltered leaderboard", async () => {
  assert.equal((await app.request("/?context_id=7")).status, 400);
  assert.equal((await app.request(query.replace("context_id=7", "context_id=7junk"))).status, 400);
  assert.equal((await app.request(query.replace("context_id=7", `context_id=${1n << 56n}`))).status, 400);
});
