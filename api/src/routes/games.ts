import { Hono } from "hono";
import { eq, desc, asc, sql, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { games, objectives, settings } from "../db/schema.js";
import { parseGameId, parseNonNegativeInt } from "../utils/validation.js";

const app = new Hono();

/**
 * Resolve a raw path param (numeric gameId or hex address) to gameId + gameAddress.
 */
async function resolveGameId(rawId: string): Promise<{ gameId: number; gameAddress: string } | null> {
  let where;
  if (rawId.startsWith("0x")) {
    // Hex address — skip parseGameId which would return 0 for "0x..."
    try {
      const normalized = `0x${BigInt(rawId).toString(16)}`;
      where = eq(games.contractAddress, normalized);
    } catch {
      return null;
    }
  } else {
    const numericId = parseGameId(rawId);
    if (numericId !== null) {
      where = eq(games.gameId, numericId);
    } else {
      return null;
    }
  }

  const result = await db
    .select({ gameId: games.gameId, contractAddress: games.contractAddress })
    .from(games)
    .where(where)
    .limit(1);

  return result.length
    ? { gameId: result[0].gameId, gameAddress: result[0].contractAddress.toLowerCase() }
    : null;
}

// GET /games - List games (paginated, with optional filters)
app.get("/", async (c) => {
  const sortBy = c.req.query("sort_by");
  const sortOrder = c.req.query("sort_order") === "asc" ? "asc" : "desc";
  const limit = parseNonNegativeInt(c.req.query("limit"), 50);
  const offset = parseNonNegativeInt(c.req.query("offset"), 0);
  const genre = c.req.query("genre");
  const developer = c.req.query("developer");
  const publisher = c.req.query("publisher");
  // `with_objectives=true` / `with_settings=true` hide games that have
  // no rows in the respective table. Backed by `EXISTS` against the
  // composite indexes `(game_address, objective_id)` and
  // `(game_address, settings_id)` — the leftmost column is the join
  // key, so this is an index-only probe per row, not a count.
  const withObjectives = c.req.query("with_objectives") === "true";
  const withSettings = c.req.query("with_settings") === "true";

  const sortFields: Record<string, any> = {
    name: games.name,
    created: games.createdAt,
    updated: games.lastUpdatedAt,
  };
  const sortColumn = sortFields[sortBy ?? ""] ?? games.createdAt;
  const orderBy = sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const conditions = [];
  if (genre) conditions.push(eq(games.genre, genre));
  if (developer) conditions.push(eq(games.developer, developer));
  if (publisher) conditions.push(eq(games.publisher, publisher));
  if (withObjectives) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${objectives} WHERE ${objectives.gameAddress} = ${games.contractAddress})`,
    );
  }
  if (withSettings) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${settings} WHERE ${settings.gameAddress} = ${games.contractAddress})`,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Correlated scalar subqueries hand back per-row counts in one
  // round-trip. Both indexes are leftmost-prefix on `game_address`, so
  // the planner uses an index-only count.
  const objectivesCount = sql<number>`(
    SELECT count(*)::int FROM ${objectives}
    WHERE ${objectives.gameAddress} = ${games.contractAddress}
  )`;
  const settingsCount = sql<number>`(
    SELECT count(*)::int FROM ${settings}
    WHERE ${settings.gameAddress} = ${games.contractAddress}
  )`;

  const [results, countResult] = await Promise.all([
    db
      .select({
        id: games.id,
        gameId: games.gameId,
        contractAddress: games.contractAddress,
        name: games.name,
        description: games.description,
        image: games.image,
        developer: games.developer,
        publisher: games.publisher,
        genre: games.genre,
        color: games.color,
        clientUrl: games.clientUrl,
        rendererAddress: games.rendererAddress,
        royaltyFraction: games.royaltyFraction,
        skillsAddress: games.skillsAddress,
        version: games.version,
        license: games.license,
        gameFeeBps: games.gameFeeBps,
        createdAt: games.createdAt,
        lastUpdatedBlock: games.lastUpdatedBlock,
        lastUpdatedAt: games.lastUpdatedAt,
        objectivesCount: objectivesCount,
        settingsCount: settingsCount,
      })
      .from(games)
      .where(where)
      .orderBy(orderBy)
      .limit(Math.min(limit, 100))
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(games)
      .where(where),
  ]);

  return c.json({
    data: results.map((r) => ({
      ...r,
      lastUpdatedBlock: r.lastUpdatedBlock?.toString() ?? null,
    })),
    total: countResult[0]?.count ?? 0,
    limit,
    offset: Math.max(offset, 0),
  });
});

// GET /games/:id/objectives/:objectiveId - Single objective
app.get("/:id/objectives/:objectiveId", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const objectiveId = parseNonNegativeInt(c.req.param("objectiveId"), -1);
  if (objectiveId < 0) {
    return c.json({ error: "Invalid objective ID" }, 400);
  }

  const [match] = await db
    .select()
    .from(objectives)
    .where(
      and(
        eq(objectives.gameAddress, resolved.gameAddress),
        eq(objectives.objectiveId, objectiveId),
      ),
    )
    .limit(1);

  if (!match) {
    return c.json({ error: "Objective not found" }, 404);
  }

  return c.json({
    data: {
      ...match,
      blockNumber: match.blockNumber.toString(),
    },
  });
});

// GET /games/:id/objectives - Objectives for a game (paginated)
app.get("/:id/objectives", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const limit = Math.min(parseNonNegativeInt(c.req.query("limit"), 50), 100);
  const offset = parseNonNegativeInt(c.req.query("offset"), 0);
  const where = eq(objectives.gameAddress, resolved.gameAddress);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(objectives)
      .where(where)
      .orderBy(objectives.objectiveId)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(objectives)
      .where(where),
  ]);

  return c.json({
    data: results.map((r) => ({
      ...r,
      blockNumber: r.blockNumber.toString(),
    })),
    total: countResult[0]?.count ?? 0,
    limit,
    offset,
  });
});

// GET /games/:id/settings/:settingsId - Single setting
app.get("/:id/settings/:settingsId", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const settingsId = parseNonNegativeInt(c.req.param("settingsId"), -1);
  if (settingsId < 0) {
    return c.json({ error: "Invalid settings ID" }, 400);
  }

  const [match] = await db
    .select()
    .from(settings)
    .where(
      and(
        eq(settings.gameAddress, resolved.gameAddress),
        eq(settings.settingsId, settingsId),
      ),
    )
    .limit(1);

  if (!match) {
    return c.json({ error: "Setting not found" }, 404);
  }

  return c.json({
    data: {
      ...match,
      blockNumber: match.blockNumber.toString(),
    },
  });
});

// GET /games/:id/settings - Settings for a game (paginated)
app.get("/:id/settings", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const limit = Math.min(parseNonNegativeInt(c.req.query("limit"), 50), 100);
  const offset = parseNonNegativeInt(c.req.query("offset"), 0);
  const where = eq(settings.gameAddress, resolved.gameAddress);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(settings)
      .where(where)
      .orderBy(settings.settingsId)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(settings)
      .where(where),
  ]);

  return c.json({
    data: results.map((r) => ({
      ...r,
      blockNumber: r.blockNumber.toString(),
    })),
    total: countResult[0]?.count ?? 0,
    limit,
    offset,
  });
});

// GET /games/:id - Single game detail (MUST be last - catch-all)
app.get("/:id", async (c) => {
  const resolved = await resolveGameId(c.req.param("id"));
  if (!resolved) {
    return c.json({ error: "Game not found" }, 404);
  }

  const objectivesCount = sql<number>`(
    SELECT count(*)::int FROM ${objectives}
    WHERE ${objectives.gameAddress} = ${games.contractAddress}
  )`;
  const settingsCount = sql<number>`(
    SELECT count(*)::int FROM ${settings}
    WHERE ${settings.gameAddress} = ${games.contractAddress}
  )`;

  const result = await db
    .select({
      id: games.id,
      gameId: games.gameId,
      contractAddress: games.contractAddress,
      name: games.name,
      description: games.description,
      image: games.image,
      developer: games.developer,
      publisher: games.publisher,
      genre: games.genre,
      color: games.color,
      clientUrl: games.clientUrl,
      rendererAddress: games.rendererAddress,
      royaltyFraction: games.royaltyFraction,
      skillsAddress: games.skillsAddress,
      version: games.version,
      license: games.license,
      gameFeeBps: games.gameFeeBps,
      createdAt: games.createdAt,
      lastUpdatedBlock: games.lastUpdatedBlock,
      lastUpdatedAt: games.lastUpdatedAt,
      objectivesCount: objectivesCount,
      settingsCount: settingsCount,
    })
    .from(games)
    .where(eq(games.gameId, resolved.gameId))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Game not found" }, 404);
  }

  const game = result[0];
  return c.json({
    data: {
      ...game,
      lastUpdatedBlock: game.lastUpdatedBlock?.toString() ?? null,
    },
  });
});

export default app;
