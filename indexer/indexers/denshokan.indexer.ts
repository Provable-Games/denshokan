/**
 * Denshokan Token Indexer
 *
 * Indexes all Denshokan token contract events and persists them to PostgreSQL.
 * Uses the Apibara SDK with Drizzle ORM for storage.
 *
 * Events indexed:
 * - Transfer: ERC721 mint/transfer for ownership tracking
 * - MetadataUpdate: ERC-4906 — marks token for URI re-fetch by standalone fetcher
 * - MinterRegistryUpdate: Minter registration/updates
 * - ObjectiveCreated: New game objective definitions
 * - SettingsCreated: New game settings definitions
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
 * - Mutable token state (score, game_over, player_name, etc.) is fetched by
 *   the standalone URI fetcher process (scripts/fetch-token-uris.ts)
 * - Idempotent writes for safe re-indexing
 */

import { defineIndexer } from "apibara/indexer";
import { useLogger } from "apibara/plugins";
import { StarknetStream } from "@apibara/starknet";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, gt } from "drizzle-orm";
import { Pool } from "pg";
import type { ApibaraRuntimeConfig } from "apibara/types";
import * as schema from "../src/lib/schema.js";
import {
  EVENT_SELECTORS,
  decodeTransfer,
  decodeMinterRegistryUpdate,
  decodeObjectiveCreated,
  decodeSettingsCreated,
  decodeMetadataUpdate,
  decodeGameRegistryUpdate,
  decodeGameMetadataUpdate,
  decodeGameRoyaltyUpdate,
  decodeGameFeeUpdate,
  decodeDefaultGameFeeUpdate,
  decodePackedTokenId,
  feltToHex,
} from "../src/lib/decoder.js";

/** Convert bigint token ID to string for numeric column storage */
const toId = (id: bigint) => id.toString();

// Identifier for our row in the indexer_cursor table. Replaces the
// "indexer_denshokan_denshokan" id that @apibara/plugin-drizzle generated
// from indexerName + identifier. The migration seeds the existing cursor
// under this shorter id.
const CURSOR_ID = "denshokan";

interface DenshokanConfig {
  contractAddress: string;
  registryAddress: string;
  streamUrl: string;
  startingBlock: string;
  databaseUrl: string;
}

export default function indexer(runtimeConfig: ApibaraRuntimeConfig) {
  const config = runtimeConfig.denshokan as DenshokanConfig;
  const {
    contractAddress,
    registryAddress,
    streamUrl,
    startingBlock: startBlockStr,
    databaseUrl,
  } = config;
  const startingBlock = BigInt(startBlockStr);

  const normalizeAddress = (addr: string) =>
    `0x${BigInt(addr).toString(16)}`;

  const normalizedAddress = normalizeAddress(contractAddress);
  const normalizedRegistryAddress = normalizeAddress(registryAddress);

  console.log("[Denshokan Indexer] Contract:", contractAddress);
  console.log("[Denshokan Indexer] Registry:", registryAddress);
  console.log("[Denshokan Indexer] Stream:", streamUrl);
  console.log("[Denshokan Indexer] Starting Block:", startingBlock.toString());

  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool, { schema });

  // Token URI fetching runs as a separate process (scripts/fetch-token-uris.ts).
  // The indexer makes zero RPC calls — it only marks tokens as needing a refetch
  // on MetadataUpdate events.

  return defineIndexer(StarknetStream)({
    streamUrl,
    finality: "accepted",
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
    hooks: {
      "run:before": () => {
        console.log("[Denshokan Indexer] Starting indexer...");
      },
      "run:after": async () => {
        console.log("[Denshokan Indexer] Indexer stopped.");
      },
      // Keep connection alive with periodic heartbeats (30 seconds), and
      // resume from the persisted cursor. Replaces airfoil.checkpoints
      // lookup from @apibara/plugin-drizzle.
      "connect:before": async ({ request }) => {
        request.heartbeatInterval = { seconds: 30n, nanos: 0 };
        const [row] = await database
          .select()
          .from(schema.indexerCursor)
          .where(eq(schema.indexerCursor.id, CURSOR_ID))
          .limit(1);
        if (row) {
          request.startingCursor = {
            orderKey: row.orderKey,
            uniqueKey: (row.uniqueKey ?? undefined) as `0x${string}` | undefined,
          };
        }
      },
      "connect:after": () => {
        console.log("[Denshokan Indexer] Connected to DNA stream.");
      },
      // Reorg handling: on invalidate, undo the rows that came from blocks
      // past the new cursor. score_history is the only append-only table —
      // delete its rows directly. tokens / games / minters / objectives /
      // settings are upserted with createdAtBlock or blockNumber stamps; we
      // delete entries that were FIRST written past the cursor (any updates
      // to older entries will be re-applied on replay since events are
      // idempotent).
      "message:invalidate": async ({ message }) => {
        const cursor = message.cursor;
        if (!cursor) return;
        const cursorOrderKey = cursor.orderKey;
        await database.transaction(async (db) => {
          await db
            .delete(schema.scoreHistory)
            .where(gt(schema.scoreHistory.blockNumber, cursorOrderKey));
          await db
            .delete(schema.tokens)
            .where(gt(schema.tokens.createdAtBlock, cursorOrderKey));
          await db
            .delete(schema.minters)
            .where(gt(schema.minters.blockNumber, cursorOrderKey));
          await db
            .delete(schema.objectives)
            .where(gt(schema.objectives.blockNumber, cursorOrderKey));
          await db
            .delete(schema.settings)
            .where(gt(schema.settings.blockNumber, cursorOrderKey));
          await db
            .update(schema.indexerCursor)
            .set({
              orderKey: cursor.orderKey,
              uniqueKey: cursor.uniqueKey ?? null,
            })
            .where(eq(schema.indexerCursor.id, CURSOR_ID));
        });
      },
    },
    async transform({ block, endCursor }) {
      const logger = useLogger();
      const db = database;
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

              const decoded = decodeMetadataUpdate(keys);
              logger.info(`${blk} MetadataUpdate: token_id=${decoded.tokenId}`);

              // Mark token for URI refetch — the standalone fetcher process
              // picks it up within its poll interval (default 30s)
              await db
                .update(schema.tokens)
                .set({ tokenUriFetched: false })
                .where(eq(schema.tokens.tokenId, toId(decoded.tokenId)));
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
          // Don't re-throw - let the indexer continue processing other events.
          // Reorgs are handled by the message:invalidate hook below.
        }
      }

      // Persist cursor at the end of transform so resume picks up from the
      // next block. This is non-transactional with the event writes above
      // (matching pre-migration behavior where individual event failures
      // didn't roll back the block); each event's upsert is idempotent so
      // re-processing on crash recovery is safe.
      if (endCursor) {
        await db
          .insert(schema.indexerCursor)
          .values({
            id: CURSOR_ID,
            orderKey: endCursor.orderKey,
            uniqueKey: endCursor.uniqueKey ?? null,
          })
          .onConflictDoUpdate({
            target: schema.indexerCursor.id,
            set: {
              orderKey: endCursor.orderKey,
              uniqueKey: endCursor.uniqueKey ?? null,
            },
          });
      }
    },
  });
}
