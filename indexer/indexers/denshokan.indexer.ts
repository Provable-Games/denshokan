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
import { eq } from "drizzle-orm";
import type { ApibaraRuntimeConfig } from "apibara/types";

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
            case EVENT_SELECTORS.Transfer: {
              const decoded = decodeTransfer(keys, data);
              const isMint = decoded.from === "0x0";

              if (isMint) {
                // Mint: decode packed token ID for immutable fields
                const packed = decodePackedTokenId(decoded.tokenId);
                logger.info(
                  `Transfer (mint): token_id=${decoded.tokenId}, to=${decoded.to}, game_id=${packed.gameId}`
                );

                await db.insert(schema.tokens).values({
                  tokenId: decoded.tokenId,
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
              } else {
                // Regular transfer: update owner
                logger.info(
                  `Transfer: token_id=${decoded.tokenId}, from=${decoded.from}, to=${decoded.to}`
                );

                await db
                  .update(schema.tokens)
                  .set({
                    ownerAddress: decoded.to,
                    lastUpdatedBlock: blockNumber,
                    lastUpdatedAt: blockTimestamp,
                  })
                  .where(eq(schema.tokens.tokenId, decoded.tokenId));
              }

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: decoded.tokenId,
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

            case EVENT_SELECTORS.GameOver: {
              const decoded = decodeGameOver(keys);
              logger.info(`GameOver: token_id=${decoded.tokenId}`);

              await db
                .update(schema.tokens)
                .set({
                  gameOver: true,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, decoded.tokenId));

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: decoded.tokenId,
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
              logger.info(`CompletedObjective: token_id=${decoded.tokenId}`);

              await db
                .update(schema.tokens)
                .set({
                  completedAllObjectives: true,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, decoded.tokenId));

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: decoded.tokenId,
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
                `MinterRegistryUpdate: minter_id=${decoded.minterId}, address=${decoded.minterAddress}`
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
                `TokenContextUpdate: token_id=${decoded.tokenId}, data_len=${decoded.data.length}`
              );

              await db
                .update(schema.tokens)
                .set({
                  contextData: decoded.data,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, decoded.tokenId));

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: decoded.tokenId,
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
                `ObjectiveCreated: game=${decoded.gameAddress}, objective_id=${decoded.objectiveId}`
              );

              await db.insert(schema.objectives).values({
                gameAddress: decoded.gameAddress,
                objectiveId: decoded.objectiveId,
                creatorAddress: decoded.creatorAddress,
                objectiveData: decoded.objectiveData,
                blockNumber,
              }).onConflictDoUpdate({
                target: [schema.objectives.gameAddress, schema.objectives.objectiveId],
                set: {
                  creatorAddress: decoded.creatorAddress,
                  objectiveData: decoded.objectiveData,
                  blockNumber,
                },
              });

              break;
            }

            case EVENT_SELECTORS.SettingsCreated: {
              const decoded = decodeSettingsCreated(keys, data);
              logger.info(
                `SettingsCreated: game=${decoded.gameAddress}, settings_id=${decoded.settingsId}`
              );

              await db.insert(schema.settings).values({
                gameAddress: decoded.gameAddress,
                settingsId: decoded.settingsId,
                creatorAddress: decoded.creatorAddress,
                settingsData: decoded.settingsData,
                blockNumber,
              }).onConflictDoUpdate({
                target: [schema.settings.gameAddress, schema.settings.settingsId],
                set: {
                  creatorAddress: decoded.creatorAddress,
                  settingsData: decoded.settingsData,
                  blockNumber,
                },
              });

              break;
            }

            case EVENT_SELECTORS.TokenRendererUpdate: {
              const decoded = decodeTokenRendererUpdate(keys, data);
              logger.info(
                `TokenRendererUpdate: token_id=${decoded.tokenId}, renderer=${decoded.renderer}`
              );

              await db
                .update(schema.tokens)
                .set({
                  rendererAddress: decoded.renderer,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                })
                .where(eq(schema.tokens.tokenId, decoded.tokenId));

              // Log event for audit trail
              await db.insert(schema.tokenEvents).values({
                tokenId: decoded.tokenId,
                eventType: "renderer_update",
                eventData: stringifyWithBigInt(decoded),
                blockNumber,
                blockTimestamp,
                transactionHash,
                eventIndex,
              }).onConflictDoNothing();

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
