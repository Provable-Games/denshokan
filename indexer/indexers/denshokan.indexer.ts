/**
 * Denshokan Token Indexer
 *
 * Indexes all Denshokan token contract events and persists them to PostgreSQL.
 * Uses the Apibara SDK with Drizzle ORM for storage.
 *
 * Events indexed:
 * - ScoreUpdate: Score changes for tokens
 * - TokenMetadataUpdate: Token mints and state changes
 * - TokenPlayerNameUpdate: Player name assignments
 * - TokenClientUrlUpdate: Client URL assignments
 * - MetadataUpdate: ERC721 standard metadata refresh
 *
 * Architecture Notes:
 * - Uses high-level defineIndexer API for simplicity
 * - Token IDs are felt252 (not u256) with packed immutable data
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
import { eq } from "drizzle-orm";
import type { ApibaraRuntimeConfig } from "apibara/types";

import * as schema from "../src/lib/schema.js";
import {
  EVENT_SELECTORS,
  decodeScoreUpdate,
  decodeTokenMetadataUpdate,
  decodeTokenPlayerNameUpdate,
  decodeTokenClientUrlUpdate,
  decodeMetadataUpdate,
  decodePackedTokenId,
  feltToHex,
  stringifyWithBigInt,
} from "../src/lib/decoder.js";

interface DenshokanConfig {
  contractAddress: string;
  streamUrl: string;
  startingBlock: string;
  databaseUrl: string;
}

export default function indexer(runtimeConfig: ApibaraRuntimeConfig) {
  // Get configuration from runtime config
  const config = runtimeConfig.denshokan as DenshokanConfig;
  const {
    contractAddress,
    streamUrl,
    startingBlock: startBlockStr,
    databaseUrl,
  } = config;
  const startingBlock = BigInt(startBlockStr);

  // Normalize contract address to ensure proper format
  const normalizedAddress = contractAddress.toLowerCase().startsWith("0x")
    ? contractAddress.toLowerCase()
    : `0x${contractAddress.toLowerCase()}`;

  // Log configuration on startup
  console.log("[Denshokan Indexer] Contract:", contractAddress);
  console.log("[Denshokan Indexer] Stream:", streamUrl);
  console.log("[Denshokan Indexer] Starting Block:", startingBlock.toString());

  // Create Drizzle database instance
  const database = drizzle({ schema, connectionString: databaseUrl });

  return defineIndexer(StarknetStream)({
    streamUrl,
    finality: "pending",
    startingBlock,
    filter: {
      events: [
        {
          address: normalizedAddress as `0x${string}`,
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
        // This prevents the stream from appearing "done" during quiet periods
        request.heartbeatInterval = { seconds: 30n, nanos: 0 };
      },
      "connect:after": () => {
        console.log("[Denshokan Indexer] Connected to DNA stream.");
      },
    },
    async transform({ block }) {
      const logger = useLogger();
      const { db } = useDrizzleStorage();
      const { events, header } = block;

      if (!header) {
        logger.warn("No header in block, skipping");
        return;
      }

      const blockNumber = header.blockNumber ?? 0n;
      const blockTimestamp = header.timestamp ?? new Date();

      if (events.length > 0) {
        logger.info(
          `Processing ${events.length} events at block ${blockNumber}`
        );
      }

      for (const event of events) {
        const keys = event.keys;
        const data = event.data;
        const transactionHash = event.transactionHash ?? "0x0";
        const eventIndex = event.eventIndex ?? 0;

        if (keys.length === 0) continue;

        const selector = feltToHex(keys[0]);

        try {
          switch (selector) {
            case EVENT_SELECTORS.TokenMetadataUpdate: {
              const decoded = decodeTokenMetadataUpdate(keys, data);
              logger.info(
                `TokenMetadataUpdate: id=${decoded.id}, game_id=${decoded.gameId}, game_over=${decoded.gameOver}`
              );

              // Check if token exists (update) or needs to be created (mint)
              const existingToken = await db
                .select()
                .from(schema.tokens)
                .where(eq(schema.tokens.tokenId, decoded.id))
                .limit(1);

              if (existingToken.length > 0) {
                // Update existing token with mutable state
                await db
                  .update(schema.tokens)
                  .set({
                    gameOver: decoded.gameOver,
                    completedAllObjectives: decoded.completedAllObjectives,
                    lastUpdatedBlock: blockNumber,
                    lastUpdatedAt: blockTimestamp,
                  })
                  .where(eq(schema.tokens.tokenId, decoded.id));
              } else {
                // New token - insert with all fields from event
                // Note: owner_address needs to come from Transfer event
                // For now, use zero address as placeholder
                // TODO: u64 version of the tokenID, just do a database counter
                await db
                  .insert(schema.tokens)
                  .values({
                    tokenId: decoded.id,
                    gameId: Number(decoded.gameId),
                    mintedBy: decoded.mintedBy,
                    settingsId: decoded.settingsId,
                    mintedAt: new Date(Number(decoded.mintedAt) * 1000),
                    lifecycleStart: Number(decoded.lifecycleStart),
                    lifecycleEnd: Number(decoded.lifecycleEnd),
                    objectivesCount: decoded.objectivesCount,
                    soulbound: decoded.soulbound,
                    hasContext: decoded.hasContext,
                    sequenceNumber: decoded.id, // Use token ID as sequence for now
                    gameOver: decoded.gameOver,
                    completedAllObjectives: decoded.completedAllObjectives,
                    ownerAddress: "0x0", // Will be updated by Transfer event
                    createdAtBlock: blockNumber,
                    lastUpdatedBlock: blockNumber,
                    lastUpdatedAt: blockTimestamp,
                  })
                  .onConflictDoUpdate({
                    target: schema.tokens.tokenId,
                    set: {
                      gameOver: decoded.gameOver,
                      completedAllObjectives: decoded.completedAllObjectives,
                      lastUpdatedBlock: blockNumber,
                      lastUpdatedAt: blockTimestamp,
                    },
                  });
              }

              // Log event for audit trail
              await db
                .insert(schema.tokenEvents)
                .values({
                  tokenId: decoded.id,
                  eventType: "metadata_update",
                  eventData: stringifyWithBigInt(decoded),
                  blockNumber,
                  blockTimestamp,
                  transactionHash,
                  eventIndex,
                })
                .onConflictDoNothing();

              break;
            }

            case EVENT_SELECTORS.ScoreUpdate: {
              const decoded = decodeScoreUpdate(keys, data);
              logger.info(
                `ScoreUpdate: token_id=${decoded.tokenId}, score=${decoded.score}`
              );

              // Update current score on token
              await db
                .update(schema.tokens)
                .set({
                  currentScore: decoded.score,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, decoded.tokenId));

              // Insert score history record
              await db
                .insert(schema.scoreHistory)
                .values({
                  tokenId: decoded.tokenId,
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
                  tokenId: decoded.tokenId,
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
                `TokenPlayerNameUpdate: id=${decoded.id}, name=${decoded.playerName}`
              );

              // Update player name on token
              await db
                .update(schema.tokens)
                .set({
                  playerName: decoded.playerName,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, decoded.id));

              // Log event for audit trail
              await db
                .insert(schema.tokenEvents)
                .values({
                  tokenId: decoded.id,
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
                `TokenClientUrlUpdate: id=${decoded.id}, url=${decoded.clientUrl}`
              );

              // Update client URL on token
              await db
                .update(schema.tokens)
                .set({
                  clientUrl: decoded.clientUrl,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, decoded.id));

              // Log event for audit trail
              await db
                .insert(schema.tokenEvents)
                .values({
                  tokenId: decoded.id,
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

            case EVENT_SELECTORS.MetadataUpdate: {
              // ERC721 standard metadata refresh event
              // This is informational - clients should refetch token metadata
              const decoded = decodeMetadataUpdate(keys);
              logger.debug(`MetadataUpdate: token_id=${decoded.tokenId}`);

              // Update last_updated timestamp
              await db
                .update(schema.tokens)
                .set({
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, decoded.tokenId));

              break;
            }

            default:
              // Unknown event - could be OZ component events (Ownable, Upgradeable, Transfer)
              // Transfer events would need to be handled to track ownership
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
