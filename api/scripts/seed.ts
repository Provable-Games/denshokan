/**
 * Database seeding script for stress testing the Denshokan API.
 *
 * Usage: npx tsx scripts/seed.ts [--count 10000] [--clean]
 *
 * Seeds tables in dependency order:
 *   games -> minters -> tokens -> score_history -> game_stats
 */

import { db, pool } from "../src/db/client.js";
import {
  games,
  minters,
  tokens,
  scoreHistory,
  gameStats,
  objectives,
  settings,
} from "../src/db/schema.js";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name: string, defaultVal: string): string {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const TOKEN_COUNT = parseInt(getArg("--count", "10000"), 10);
const CLEAN = args.includes("--clean") || !args.includes("--no-clean"); // clean by default

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return "0x" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomAddress(): string {
  return randomHex(32);
}

/** Zipf-like distribution: lower indices are much more likely. */
function zipfIndex(max: number): number {
  // Inverse CDF approximation for Zipf s=1
  const u = Math.random();
  const idx = Math.floor(max * Math.pow(u, 2));
  return Math.min(idx, max - 1);
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(startDaysAgo: number, endDaysAgo: number): Date {
  const now = Date.now();
  const start = now - startDaysAgo * 86400000;
  const end = now - endDaysAgo * 86400000;
  return new Date(start + Math.random() * (end - start));
}

/** Batch insert helper – splits rows into chunks and inserts sequentially. */
async function batchInsert<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  batchSize: number,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    await db.insert(table as any).values(chunk as any);
  }
}

// ---------------------------------------------------------------------------
// Data generation
// ---------------------------------------------------------------------------

const GAME_COUNT = 10;
const MINTER_COUNT = 5;
const OWNER_COUNT = 100;

function generateGames() {
  const gameNames = [
    "Dragon Quest",
    "Loot Survivor",
    "Dark Shuffle",
    "Number Guess",
    "Tic Tac Toe",
    "Summit",
    "Budokan",
    "Realm Battles",
    "Chain Legends",
    "Pixel Arena",
  ];
  return Array.from({ length: GAME_COUNT }, (_, i) => ({
    gameId: i + 1,
    contractAddress: randomAddress(),
    name: gameNames[i],
    description: `${gameNames[i]} - an on-chain game`,
    developer: `dev_${i}`,
    publisher: `pub_${Math.floor(i / 3)}`,
    genre: randomPick(["RPG", "Strategy", "Puzzle", "Action", "Adventure"]),
    color: `#${randomInt(0, 0xffffff).toString(16).padStart(6, "0")}`,
    clientUrl: `https://games.example.com/${gameNames[i].toLowerCase().replace(/\s/g, "-")}`,
    lastUpdatedBlock: BigInt(randomInt(100000, 200000)),
  }));
}

function generateMinters() {
  return Array.from({ length: MINTER_COUNT }, (_, i) => ({
    minterId: BigInt(i + 1),
    contractAddress: randomAddress(),
    name: `Minter_${i + 1}`,
    blockNumber: BigInt(randomInt(50000, 100000)),
  }));
}

function generateOwners(): string[] {
  return Array.from({ length: OWNER_COUNT }, () => randomAddress());
}

function generateTokens(
  count: number,
  owners: string[],
  gameIds: number[],
  minterIds: bigint[],
) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const gameId = randomPick(gameIds);
    const mintedAt = randomDate(365, 0);
    const isGameOver = Math.random() < 0.4;
    const score = isGameOver ? BigInt(randomInt(100, 100000)) : BigInt(randomInt(0, 50000));
    const blockNum = BigInt(randomInt(100000, 300000));

    rows.push({
      tokenId: (BigInt(i + 1) * 1000000007n + BigInt(randomInt(0, 999999))).toString(),
      gameId,
      mintedBy: randomPick(minterIds),
      settingsId: randomInt(0, 3),
      mintedAt,
      startDelay: randomInt(0, 10),
      endDelay: randomInt(0, 60),
      objectiveId: randomInt(0, 5),
      soulbound: Math.random() < 0.2,
      hasContext: Math.random() < 0.3,
      paymaster: Math.random() < 0.1,
      txHash: randomInt(0, 999999),
      salt: randomInt(0, 999999),
      metadata: randomInt(0, 255),
      gameOver: isGameOver,
      completedAllObjectives: isGameOver && Math.random() < 0.3,
      ownerAddress: owners[zipfIndex(owners.length)],
      playerName: Math.random() < 0.6 ? `player_${randomInt(1, 500)}` : null,
      currentScore: score,
      createdAtBlock: blockNum,
      lastUpdatedBlock: blockNum + BigInt(randomInt(0, 1000)),
      lastUpdatedAt: new Date(mintedAt.getTime() + randomInt(0, 86400000 * 30)),
    });
  }
  return rows;
}

interface TokenRow {
  tokenId: string;
  gameId: number;
  gameOver: boolean;
  currentScore: bigint;
  ownerAddress: string;
  lastUpdatedAt: Date;
}

function generateScoreHistory(tokenRows: TokenRow[]) {
  const rows = [];
  for (const t of tokenRows) {
    const count = randomInt(3, 5);
    for (let j = 0; j < count; j++) {
      const ts = new Date(t.lastUpdatedAt.getTime() - j * randomInt(60000, 3600000));
      rows.push({
        tokenId: t.tokenId,
        score: BigInt(Math.max(0, Number(t.currentScore) - randomInt(0, 5000) * j)),
        blockNumber: BigInt(randomInt(100000, 300000)),
        blockTimestamp: ts,
        transactionHash: randomHex(32),
        eventIndex: j,
      });
    }
  }
  return rows;
}

function generateGameStats(
  gameIds: number[],
  tokenRows: TokenRow[],
) {
  return gameIds.map((gid) => {
    const gameTokens = tokenRows.filter((t) => t.gameId === gid);
    const completed = gameTokens.filter((t) => t.gameOver).length;
    const uniqueOwners = new Set(gameTokens.map((t) => t.ownerAddress)).size;
    return {
      gameId: gid,
      totalTokens: gameTokens.length,
      completedGames: completed,
      activeGames: gameTokens.length - completed,
      uniquePlayers: uniqueOwners,
    };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Seeding database with ${TOKEN_COUNT} tokens...`);
  const t0 = performance.now();

  if (CLEAN) {
    console.log("Cleaning existing data...");
    // Truncate in reverse dependency order
    await db.delete(gameStats);
    await db.delete(scoreHistory);
    await db.delete(tokens);
    await db.delete(objectives);
    await db.delete(settings);
    await db.delete(minters);
    await db.delete(games);
    console.log("Tables cleaned.");
  }

  // 1. Games
  const gameRows = generateGames();
  await db.insert(games).values(gameRows);
  console.log(`  games: ${gameRows.length}`);

  // 2. Minters
  const minterRows = generateMinters();
  await db.insert(minters).values(minterRows);
  console.log(`  minters: ${minterRows.length}`);

  // 3. Tokens
  const gameIds = gameRows.map((g) => g.gameId);
  const minterIds = minterRows.map((m) => m.minterId);
  const owners = generateOwners();
  const tokenRows = generateTokens(TOKEN_COUNT, owners, gameIds, minterIds);
  await batchInsert(tokens, tokenRows, 500);
  console.log(`  tokens: ${tokenRows.length}`);

  // 4. Score history
  const scoreRows = generateScoreHistory(tokenRows);
  await batchInsert(scoreHistory, scoreRows, 1000);
  console.log(`  score_history: ${scoreRows.length}`);

  // 5. Game stats
  const statsRows = generateGameStats(gameIds, tokenRows);
  await db.insert(gameStats).values(statsRows);
  console.log(`  game_stats: ${statsRows.length}`);

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\nSeeding complete in ${elapsed}s.`);

  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
