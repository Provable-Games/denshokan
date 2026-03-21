/**
 * Denshokan Token Indexer
 *
 * Indexes all Denshokan token contract events and persists them to PostgreSQL.
 * Uses the Apibara SDK with Drizzle ORM for storage.
 *
 * Events indexed:
 * - Transfer: ERC721 mint/transfer for ownership tracking
 * - ScoreUpdate: Score changes for tokens
 * - TokenPlayerNameUpdate: Player name assignments
 * - TokenClientUrlUpdate: Client URL assignments
 * - GameOver: Game completion for tokens
 * - CompletedObjective: Objective completion for tokens
 * - MinterRegistryUpdate: Minter registration/updates
 * - TokenContextUpdate: Token context data updates
 * - ObjectiveCreated: New game objective definitions
 * - SettingsCreated: New game settings definitions
 * - TokenRendererUpdate: Token renderer contract updates
 * - GameRegistryUpdate: Game registration from registry contract
 * - GameMetadataUpdate: Game metadata from registry contract
 * - GameRoyaltyUpdate: Game royalty changes from registry contract
 * - GameFeeUpdate: Per-game license and fee changes from registry contract
 * - DefaultGameFeeUpdate: Default license and fee changes from registry contract
 *
 * Architecture Notes:
 * - Uses high-level defineIndexer API for simplicity
 * - Token IDs are felt252 (not u256) with packed immutable data
 * - On mint (Transfer from 0x0), packed token ID is decoded for immutable fields
 * - Mutable state tracked separately via events
 * - Idempotent writes for safe re-indexing
 */

import { defineIndexer } from "apibara/indexer";
import { useLogger } from "apibara/plugins";
import { StarknetStream } from "@apibara/starknet";
import {
  drizzle,
  drizzleStorage,
  useDrizzleStorage,
} from "@apibara/plugin-drizzle";
import { eq, sql, and, ne } from "drizzle-orm";
import type { ApibaraRuntimeConfig } from "apibara/types";
import { RpcProvider, Contract } from "starknet";
import { readFileSync } from "fs";
import { resolve } from "path";

import * as schema from "../src/lib/schema.js";
import {
  EVENT_SELECTORS,
  decodeTransfer,
  decodeScoreUpdate,
  decodeTokenPlayerNameUpdate,
  decodeTokenClientUrlUpdate,
  decodeGameOver,
  decodeCompletedObjective,
  decodeMinterRegistryUpdate,
  decodeTokenContextUpdate,
  decodeObjectiveCreated,
  decodeSettingsCreated,
  decodeTokenRendererUpdate,
  decodeTokenSkillsUpdate,
  decodeMetadataUpdate,
  decodeGameRegistryUpdate,
  decodeGameMetadataUpdate,
  decodeGameRoyaltyUpdate,
  decodeGameFeeUpdate,
  decodeDefaultGameFeeUpdate,
  decodePackedTokenId,
  feltToHex,
  stringifyWithBigInt,
} from "../src/lib/decoder.js";

/** Convert bigint token ID to string for numeric column storage */
const toId = (id: bigint) => id.toString();

/** Full ABI needed for starknet.js to properly decode ByteArray return types */
const DENSHOKAN_ABI = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/lib/abi/denshokan.json"), "utf-8")
);

interface DenshokanConfig {
  contractAddress: string;
  registryAddress: string;
  streamUrl: string;
  startingBlock: string;
  databaseUrl: string;
  rpcUrl: string;
}

export default function indexer(runtimeConfig: ApibaraRuntimeConfig) {
  // Get configuration from runtime config
  const config = runtimeConfig.denshokan as DenshokanConfig;
  const {
    contractAddress,
    registryAddress,
    streamUrl,
    startingBlock: startBlockStr,
    databaseUrl,
    rpcUrl,
  } = config;
  const startingBlock = BigInt(startBlockStr);

  // Normalize contract addresses: lowercase hex with no leading-zero padding
  const normalizeAddress = (addr: string) =>
    `0x${BigInt(addr).toString(16)}`;

  const normalizedAddress = normalizeAddress(contractAddress);
  const normalizedRegistryAddress = normalizeAddress(registryAddress);

  // Log configuration on startup
  console.log("[Denshokan Indexer] Contract:", contractAddress);
  console.log("[Denshokan Indexer] Registry:", registryAddress);
  console.log("[Denshokan Indexer] Stream:", streamUrl);
  console.log("[Denshokan Indexer] Starting Block:", startingBlock.toString());
  console.log("[Denshokan Indexer] RPC URL:", rpcUrl);

  // Create Drizzle database instance
  const database = drizzle({ schema, connectionString: databaseUrl });

  // Create Starknet RPC provider and contract for token_uri fetches
  const starknetProvider = new RpcProvider({ nodeUrl: rpcUrl });
  const denshokanContract = new Contract({ abi: DENSHOKAN_ABI, address: normalizedAddress, providerOrAccount: starknetProvider });

  // ============ Async URI Fetch Queue ============
  const URI_FETCH_CONCURRENCY = 5;
  const uriFetchQueue: Array<{ tokenId: bigint }> = [];
  let uriFetchRunning = false;

  async function processUriFetchQueue(): Promise<void> {
    if (uriFetchRunning || uriFetchQueue.length === 0) return;
    uriFetchRunning = true;

    while (uriFetchQueue.length > 0) {
      const batch = uriFetchQueue.splice(0, URI_FETCH_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(({ tokenId }) => fetchTokenUri(tokenId))
      );
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.warn(`[URI Queue] Failed for token ${batch[i].tokenId}: ${r.reason}`);
        }
      });
    }

    uriFetchRunning = false;
  }

  async function fetchTokenUri(tokenId: bigint): Promise<void> {
    const result = await denshokanContract.call("token_uri", [tokenId]);
    const uri = result.toString();
    await database
      .update(schema.tokens)
      .set({ tokenUri: uri, tokenUriFetched: true })
      .where(eq(schema.tokens.tokenId, toId(tokenId)));
  }

  function queueUriFetch(tokenId: bigint): void {
    uriFetchQueue.push({ tokenId });
    // Fire-and-forget — don't await
    processUriFetchQueue().catch((err) =>
      console.error(`[URI Queue] Processing error: ${err}`)
    );
  }

  /** Fetch token_uri synchronously (for live MetadataUpdate events) */
  async function fetchAndStoreTokenUri(
    db: ReturnType<typeof useDrizzleStorage>["db"],
    tokenId: bigint,
  ): Promise<void> {
    try {
      const result = await denshokanContract.call("token_uri", [tokenId]);
      const uri = result.toString();
      await db
        .update(schema.tokens)
        .set({ tokenUri: uri, tokenUriFetched: true })
        .where(eq(schema.tokens.tokenId, toId(tokenId)));
      console.log(`[URI] Fetched token_uri for ${tokenId}: ${uri.substring(0, 80)}...`);
    } catch (error) {
      console.warn(`[URI] Failed to fetch token_uri for ${tokenId}: ${error}`);
    }
  }

  return defineIndexer(StarknetStream)({
    streamUrl,
    finality: "pending",
    startingBlock,
    filter: {
      events: [
        {
          address: normalizedAddress as `0x${string}`,
        },
        {
          address: normalizedRegistryAddress as `0x${string}`,
        },
      ],
    },
    plugins: [
      drizzleStorage({
        db: database,
        persistState: true,
        indexerName: "denshokan",
        idColumn: "id",
        migrate: {
          migrationsFolder: "./migrations",
        },
      }),
    ],
    hooks: {
      "run:before": () => {
        console.log("[Denshokan Indexer] Starting indexer...");
      },
      "run:after": async () => {
        console.log("[Denshokan Indexer] Indexer stopped.");
      },
      "connect:before": ({ request }) => {
        // Keep connection alive with periodic heartbeats (30 seconds)
        request.heartbeatInterval = { seconds: 30n, nanos: 0 };
      },
      "connect:after": async () => {
        console.log("[Denshokan Indexer] Connected to DNA stream.");

        // Retry URI fetches for tokens that failed or were never fetched
        try {
          const unfetched = await database
            .select({ tokenId: schema.tokens.tokenId })
            .from(schema.tokens)
            .where(eq(schema.tokens.tokenUriFetched, false));

          if (unfetched.length > 0) {
            console.log(`[URI Retry] Queuing ${unfetched.length} tokens with missing token_uri`);
            for (const row of unfetched) {
              queueUriFetch(BigInt(row.tokenId));
            }
          }
        } catch (err) {
          console.warn(`[URI Retry] Failed to query unfetched tokens: ${err}`);
        }
      },
    },
    async transform({ block, production }) {
      const logger = useLogger();
      const { db } = useDrizzleStorage();
      const { events, header } = block;

      if (!header) {
        logger.warn("No header in block, skipping");
        return;
      }

      const blockNumber = header.blockNumber ?? 0n;
      const blockTimestamp = header.timestamp ?? new Date();
      const blk = `[block=${blockNumber}]`;

      if (events.length > 0) {
        logger.info(
          `${blk} Processing ${events.length} events`
        );
      }

      for (const event of events) {
        const keys = event.keys;
        const data = event.data;
        const transactionHash = event.transactionHash ?? "0x0";
        const eventIndex = event.eventIndex ?? 0;
        const eventAddress = event.address
          ? normalizeAddress(feltToHex(event.address))
          : "";

        if (keys.length === 0) continue;

        const selector = feltToHex(keys[0]);

        try {
          switch (selector) {
            case EVENT_SELECTORS.Transfer: {
              // Only process Transfer events from the Denshokan token contract
              if (eventAddress && eventAddress !== normalizedAddress) break;

              const decoded = decodeTransfer(keys, data);
              const isMint = decoded.from === "0x0";

              if (isMint) {
                // Mint: decode packed token ID for immutable fields
                const packed = decodePackedTokenId(decoded.tokenId);
                logger.info(
                  `${blk} Transfer (mint): token_id=${decoded.tokenId}, to=${decoded.to}, game_id=${packed.gameId}`
                );

                await db.insert(schema.tokens).values({
                  tokenId: toId(decoded.tokenId),
                  gameId: packed.gameId,
                  mintedBy: packed.mintedBy,
                  settingsId: packed.settingsId,
                  mintedAt: packed.mintedAt,
                  startDelay: packed.startDelay,
                  endDelay: packed.endDelay,
                  objectiveId: packed.objectiveId,
                  soulbound: packed.soulbound,
                  hasContext: packed.hasContext,
                  paymaster: packed.paymaster,
                  txHash: packed.txHash,
                  salt: packed.salt,
                  metadata: packed.metadata,
                  ownerAddress: decoded.to,
                  createdAtBlock: blockNumber,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                }).onConflictDoUpdate({
                  target: schema.tokens.tokenId,
                  set: {
                    ownerAddress: decoded.to,
                    lastUpdatedBlock: blockNumber,
                    lastUpdatedAt: blockTimestamp,
                  },
                });

                // Backfill mutable fields from events that fired before
                // this mint (the contract emits TokenContextUpdate,
                // TokenPlayerNameUpdate, TokenClientUrlUpdate, etc.
                // before Transfer, so the earlier UPDATEs hit no row).
                const preMintEvents = await db
                  .select({
                    eventType: schema.tokenEvents.eventType,
                    eventData: schema.tokenEvents.eventData,
                  })
                  .from(schema.tokenEvents)
                  .where(eq(schema.tokenEvents.tokenId, toId(decoded.tokenId)));

                if (preMintEvents.length > 0) {
                  const patch: Record<string, unknown> = {};
                  for (const evt of preMintEvents) {
                    try {
                      const d = JSON.parse(evt.eventData as string);
                      switch (evt.eventType) {
                        case "context_update":
                          patch.contextId = d.contextId ?? null;
                          patch.contextData = d.data ?? null;
                          break;
                        case "player_name":
                          patch.playerName = d.playerName ?? null;
                          break;
                        case "client_url":
                          patch.clientUrl = d.clientUrl ?? null;
                          break;
                        case "renderer_update":
                          patch.rendererAddress = d.renderer ?? d.rendererAddress ?? null;
                          break;
                        case "skills_update":
                          patch.skillsAddress = d.skillsAddress ?? null;
                          break;
                      }
                    } catch {
                      // Best-effort: skip unparseable events
                    }
                  }
                  if (Object.keys(patch).length > 0) {
                    await db
                      .update(schema.tokens)
                      .set(patch)
                      .where(eq(schema.tokens.tokenId, toId(decoded.tokenId)));
                  }
                }

                // Queue async token_uri fetch (non-blocking)
                queueUriFetch(decoded.tokenId);

                // Check if this is a new unique player for this game
                const existingPlayerTokens = await db
                  .select({ count: sql<number>`count(*)` })
                  .from(schema.tokens)
                  .where(
                    and(
                      eq(schema.tokens.gameId, packed.gameId),
                      eq(schema.tokens.ownerAddress, decoded.to),
                      ne(schema.tokens.tokenId, toId(decoded.tokenId))
                    )
                  );
                const isNewPlayer = existingPlayerTokens[0].count === 0;

                // Update game stats: increment totalTokens, activeGames, and uniquePlayers if new
                await db
                  .insert(schema.gameStats)
                  .values({
                    gameId: packed.gameId,
                    totalTokens: 1,
                    activeGames: 1,
                    completedGames: 0,
                    uniquePlayers: isNewPlayer ? 1 : 0,
                    lastUpdated: blockTimestamp,
                  })
                  .onConflictDoUpdate({
                    target: schema.gameStats.gameId,
                    set: {
                      totalTokens: sql`${schema.gameStats.totalTokens} + 1`,
                      activeGames: sql`${schema.gameStats.activeGames} + 1`,
                      uniquePlayers: isNewPlayer
                        ? sql`${schema.gameStats.uniquePlayers} + 1`
                        : schema.gameStats.uniquePlayers,
                      lastUpdated: blockTimestamp,
                    },
                  });
              } else {
                // Regular transfer: update owner
                logger.info(
                  `${blk} Transfer: token_id=${decoded.tokenId}, from=${decoded.from}, to=${decoded.to}`
                );

                await db
                  .update(schema.tokens)
                  .set({
                    ownerAddress: decoded.to,
                    lastUpdatedBlock: blockNumber,
                    lastUpdatedAt: blockTimestamp,
                  })
                  .where(eq(schema.tokens.tokenId, toId(decoded.tokenId)));
              }

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: toId(decoded.tokenId),
                eventType: isMint ? "mint" : "transfer",
                eventData: stringifyWithBigInt(decoded),
                blockNumber,
                blockTimestamp,
                transactionHash,
                eventIndex,
              }).onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.ScoreUpdate: {
              const decoded = decodeScoreUpdate(keys, data);
              logger.info(
                `${blk} ScoreUpdate: token_id=${decoded.tokenId}, score=${decoded.score}`
              );

              // Update current score on token
              await db
                .update(schema.tokens)
                .set({
                  currentScore: decoded.score,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, toId(decoded.tokenId)));

              // Insert score history record
              await db
                .insert(schema.scoreHistory)
                .values({
                  tokenId: toId(decoded.tokenId),
                  score: decoded.score,
                  blockNumber,
                  blockTimestamp,
                  transactionHash,
                  eventIndex,
                })
                .onConflictDoNothing();

              // Log event for audit trail
              await db
                .insert(schema.tokenEvents)
                .values({
                  tokenId: toId(decoded.tokenId),
                  eventType: "score_update",
                  eventData: stringifyWithBigInt(decoded),
                  blockNumber,
                  blockTimestamp,
                  transactionHash,
                  eventIndex,
                })
                .onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.TokenPlayerNameUpdate: {
              const decoded = decodeTokenPlayerNameUpdate(keys, data);
              logger.info(
                `${blk} TokenPlayerNameUpdate: id=${decoded.id}, name=${decoded.playerName}`
              );

              // Update player name on token
              await db
                .update(schema.tokens)
                .set({
                  playerName: decoded.playerName,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, toId(decoded.id)));

              // Log event for audit trail
              await db
                .insert(schema.tokenEvents)
                .values({
                  tokenId: toId(decoded.id),
                  eventType: "player_name",
                  eventData: stringifyWithBigInt(decoded),
                  blockNumber,
                  blockTimestamp,
                  transactionHash,
                  eventIndex,
                })
                .onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.TokenClientUrlUpdate: {
              const decoded = decodeTokenClientUrlUpdate(keys, data);
              logger.info(
                `${blk} TokenClientUrlUpdate: id=${decoded.id}, url=${decoded.clientUrl}`
              );

              // Update client URL on token
              await db
                .update(schema.tokens)
                .set({
                  clientUrl: decoded.clientUrl,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, toId(decoded.id)));

              // Log event for audit trail
              await db
                .insert(schema.tokenEvents)
                .values({
                  tokenId: toId(decoded.id),
                  eventType: "client_url",
                  eventData: stringifyWithBigInt(decoded),
                  blockNumber,
                  blockTimestamp,
                  transactionHash,
                  eventIndex,
                })
                .onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.GameOver: {
              const decoded = decodeGameOver(keys);
              logger.info(`${blk} GameOver: token_id=${decoded.tokenId}`);

              // Get token to find its gameId
              const token = await db
                .select({ gameId: schema.tokens.gameId })
                .from(schema.tokens)
                .where(eq(schema.tokens.tokenId, toId(decoded.tokenId)))
                .limit(1);

              await db
                .update(schema.tokens)
                .set({
                  gameOver: true,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, toId(decoded.tokenId)));

              // Update game stats: decrement activeGames, increment completedGames
              if (token.length > 0) {
                await db
                  .update(schema.gameStats)
                  .set({
                    activeGames: sql`GREATEST(${schema.gameStats.activeGames} - 1, 0)`,
                    completedGames: sql`${schema.gameStats.completedGames} + 1`,
                    lastUpdated: blockTimestamp,
                  })
                  .where(eq(schema.gameStats.gameId, token[0].gameId));
              }

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: toId(decoded.tokenId),
                eventType: "game_over",
                eventData: stringifyWithBigInt(decoded),
                blockNumber,
                blockTimestamp,
                transactionHash,
                eventIndex,
              }).onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.CompletedObjective: {
              const decoded = decodeCompletedObjective(keys);
              logger.info(`${blk} CompletedObjective: token_id=${decoded.tokenId}`);

              await db
                .update(schema.tokens)
                .set({
                  completedAllObjectives: true,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, toId(decoded.tokenId)));

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: toId(decoded.tokenId),
                eventType: "completed_objective",
                eventData: stringifyWithBigInt(decoded),
                blockNumber,
                blockTimestamp,
                transactionHash,
                eventIndex,
              }).onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.MinterRegistryUpdate: {
              const decoded = decodeMinterRegistryUpdate(keys, data);
              logger.info(
                `${blk} MinterRegistryUpdate: minter_id=${decoded.minterId}, address=${decoded.minterAddress}`
              );

              await db.insert(schema.minters).values({
                minterId: decoded.minterId,
                contractAddress: decoded.minterAddress,
                blockNumber,
              }).onConflictDoUpdate({
                target: schema.minters.minterId,
                set: {
                  contractAddress: decoded.minterAddress,
                  blockNumber,
                },
              });

              break;
            }

            case EVENT_SELECTORS.TokenContextUpdate: {
              const decoded = decodeTokenContextUpdate(keys, data);
              logger.info(
                `${blk} TokenContextUpdate: token_id=${decoded.tokenId}, context_id=${decoded.contextId}, name=${decoded.data.name}, context_pairs=${decoded.data.context.length}`
              );

              await db
                .update(schema.tokens)
                .set({
                  contextData: decoded.data,
                  contextId: decoded.contextId,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, toId(decoded.tokenId)));

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: toId(decoded.tokenId),
                eventType: "context_update",
                eventData: stringifyWithBigInt(decoded),
                blockNumber,
                blockTimestamp,
                transactionHash,
                eventIndex,
              }).onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.ObjectiveCreated: {
              const decoded = decodeObjectiveCreated(keys, data);
              logger.info(
                `${blk} ObjectiveCreated: game=${decoded.gameAddress}, objective_id=${decoded.objectiveId}, name=${decoded.name}`
              );

              await db.insert(schema.objectives).values({
                gameAddress: decoded.gameAddress,
                objectiveId: decoded.objectiveId,
                settingsId: 0,
                creatorAddress: decoded.creatorAddress,
                objectiveData: decoded.objectiveData,
                name: decoded.name,
                description: decoded.description,
                objectives: decoded.objectives,
                blockNumber,
              }).onConflictDoUpdate({
                target: [schema.objectives.gameAddress, schema.objectives.objectiveId],
                set: {
                  creatorAddress: decoded.creatorAddress,
                  objectiveData: decoded.objectiveData,
                  name: decoded.name,
                  description: decoded.description,
                  objectives: decoded.objectives,
                  blockNumber,
                },
              });

              break;
            }

            case EVENT_SELECTORS.SettingsCreated: {
              const decoded = decodeSettingsCreated(keys, data);
              logger.info(
                `${blk} SettingsCreated: game=${decoded.gameAddress}, settings_id=${decoded.settingsId}, name=${decoded.name}`
              );

              await db.insert(schema.settings).values({
                gameAddress: decoded.gameAddress,
                settingsId: decoded.settingsId,
                creatorAddress: decoded.creatorAddress,
                settingsData: decoded.settingsData,
                name: decoded.name,
                description: decoded.description,
                settings: decoded.settings,
                blockNumber,
              }).onConflictDoUpdate({
                target: [schema.settings.gameAddress, schema.settings.settingsId],
                set: {
                  creatorAddress: decoded.creatorAddress,
                  settingsData: decoded.settingsData,
                  name: decoded.name,
                  description: decoded.description,
                  settings: decoded.settings,
                  blockNumber,
                },
              });

              break;
            }

            case EVENT_SELECTORS.TokenRendererUpdate: {
              const decoded = decodeTokenRendererUpdate(keys, data);
              logger.info(
                `${blk} TokenRendererUpdate: token_id=${decoded.tokenId}, renderer=${decoded.renderer}`
              );

              await db
                .update(schema.tokens)
                .set({
                  rendererAddress: decoded.renderer,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, toId(decoded.tokenId)));

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: toId(decoded.tokenId),
                eventType: "renderer_update",
                eventData: stringifyWithBigInt(decoded),
                blockNumber,
                blockTimestamp,
                transactionHash,
                eventIndex,
              }).onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.TokenSkillsUpdate: {
              const decoded = decodeTokenSkillsUpdate(keys, data);
              logger.info(
                `${blk} TokenSkillsUpdate: token_id=${decoded.tokenId}, skills=${decoded.skillsAddress}`
              );

              await db
                .update(schema.tokens)
                .set({
                  skillsAddress: decoded.skillsAddress,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, toId(decoded.tokenId)));

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: toId(decoded.tokenId),
                eventType: "skills_update",
                eventData: stringifyWithBigInt(decoded),
                blockNumber,
                blockTimestamp,
                transactionHash,
                eventIndex,
              }).onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.GameRegistryUpdate: {
              const decoded = decodeGameRegistryUpdate(keys, data);
              logger.info(
                `${blk} GameRegistryUpdate: game_id=${decoded.gameId}, contract=${decoded.contractAddress}`
              );

              await db.insert(schema.games).values({
                gameId: decoded.gameId,
                contractAddress: decoded.contractAddress,
                lastUpdatedBlock: blockNumber,
                lastUpdatedAt: blockTimestamp,
              }).onConflictDoUpdate({
                target: schema.games.gameId,
                set: {
                  contractAddress: decoded.contractAddress,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                },
              });

              // Ensure game_stats row exists so the API doesn't 404 before first mint
              await db.insert(schema.gameStats).values({
                gameId: decoded.gameId,
                totalTokens: 0,
                activeGames: 0,
                completedGames: 0,
                uniquePlayers: 0,
                lastUpdated: blockTimestamp,
              }).onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.GameMetadataUpdate: {
              const decoded = decodeGameMetadataUpdate(keys, data);
              logger.info(
                `${blk} GameMetadataUpdate: game_id=${decoded.gameId}, name=${decoded.name}`
              );

              await db.insert(schema.games).values({
                gameId: decoded.gameId,
                contractAddress: decoded.contractAddress,
                name: decoded.name,
                description: decoded.description,
                image: decoded.image,
                developer: decoded.developer,
                publisher: decoded.publisher,
                genre: decoded.genre,
                color: decoded.color,
                clientUrl: decoded.clientUrl,
                rendererAddress: decoded.rendererAddress,
                royaltyFraction: decoded.royaltyFraction,
                skillsAddress: decoded.skillsAddress,
                version: decoded.version,
                lastUpdatedBlock: blockNumber,
                lastUpdatedAt: blockTimestamp,
              }).onConflictDoUpdate({
                target: schema.games.gameId,
                set: {
                  contractAddress: decoded.contractAddress,
                  name: decoded.name,
                  description: decoded.description,
                  image: decoded.image,
                  developer: decoded.developer,
                  publisher: decoded.publisher,
                  genre: decoded.genre,
                  color: decoded.color,
                  clientUrl: decoded.clientUrl,
                  rendererAddress: decoded.rendererAddress,
                  royaltyFraction: decoded.royaltyFraction,
                  skillsAddress: decoded.skillsAddress,
                  version: decoded.version,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                },
              });

              break;
            }

            case EVENT_SELECTORS.GameRoyaltyUpdate: {
              const decoded = decodeGameRoyaltyUpdate(keys, data);
              logger.info(
                `${blk} GameRoyaltyUpdate: game_id=${decoded.gameId}, fraction=${decoded.royaltyFraction}`
              );

              await db
                .update(schema.games)
                .set({
                  royaltyFraction: decoded.royaltyFraction,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.games.gameId, decoded.gameId));

              break;
            }

            case EVENT_SELECTORS.GameFeeUpdate: {
              const decoded = decodeGameFeeUpdate(keys, data);
              logger.info(
                `${blk} GameFeeUpdate: game_id=${decoded.gameId}, license=${decoded.license}, fee=${decoded.feeNumerator}`
              );

              await db
                .update(schema.games)
                .set({
                  license: decoded.license,
                  gameFeeBps: decoded.feeNumerator,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.games.gameId, decoded.gameId));

              break;
            }

            case EVENT_SELECTORS.DefaultGameFeeUpdate: {
              const decoded = decodeDefaultGameFeeUpdate(keys, data);
              logger.info(
                `${blk} DefaultGameFeeUpdate: license=${decoded.license}, fee=${decoded.feeNumerator}`
              );
              // Default fee is not persisted per-game — SDK uses RPC fallback.
              // Games with explicit per-game fees are unaffected.
              break;
            }

            case EVENT_SELECTORS.MetadataUpdate: {
              if (eventAddress && eventAddress !== normalizedAddress) break;
              if (production !== "live") break; // Only process at head

              const decoded = decodeMetadataUpdate(keys);
              logger.info(`${blk} MetadataUpdate: token_id=${decoded.tokenId}`);

              // Synchronous fetch — at head, we want immediate URI updates
              await fetchAndStoreTokenUri(db, decoded.tokenId);
              break;
            }

            default:
              // Unknown event - could be OZ component events (Ownable, Upgradeable)
              logger.debug(`Unknown event selector: ${selector}`);
              break;
          }
        } catch (error) {
          logger.error(
            `Error processing event at block ${blockNumber}, index ${eventIndex}: ${error}`
          );
          logger.error(`Event selector: ${selector}`);
          logger.error(`Keys: ${JSON.stringify(keys)}`);
          logger.error(`Data: ${JSON.stringify(data)}`);
          // Don't re-throw - let the indexer continue processing other events
          // Reorgs are handled automatically by the Drizzle plugin via message:invalidate hook
        }
      }
    },
  });
}
