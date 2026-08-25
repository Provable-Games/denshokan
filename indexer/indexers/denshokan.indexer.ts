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
import {
  drizzle,
  drizzleStorage,
  useDrizzleStorage,
} from "@apibara/plugin-drizzle";
import { and, eq, isNull } from "drizzle-orm";
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

interface DenshokanConfig {
  streamUrl: string;
  startingBlock: string;
  databaseUrl: string;
  /**
   * The game contracts to index. Each game IS its own ERC721 — there is no
   * shared token contract and no registry — so this is the whole subscription
   * list, not an addition to one.
   */
  gameAddresses?: string[];
}

export default function indexer(runtimeConfig: ApibaraRuntimeConfig) {
  const config = runtimeConfig.denshokan as DenshokanConfig;
  const { streamUrl, startingBlock: startBlockStr, databaseUrl } = config;
  const startingBlock = BigInt(startBlockStr);

  const normalizeAddress = (addr: string) =>
    `0x${BigInt(addr).toString(16)}`;

  const normalizedGames = (config.gameAddresses ?? []).map(normalizeAddress);
  const gameSet = new Set(normalizedGames);

  if (normalizedGames.length === 0) {
    // Every event this indexer handles comes from a game contract, so an
    // empty list would subscribe to nothing and silently index no data.
    throw new Error(
      "[Denshokan Indexer] GAME_ADDRESSES is empty — nothing to index. " +
        "Set it to the comma-separated game contract addresses.",
    );
  }

  /** True for contracts we subscribed to. Guards against stray events. */
  const isTokenContract = (address: string): boolean => gameSet.has(address);

  /**
   * Matches exactly one token row.
   *
   * A token id identifies a row only together with the contract that issued
   * it — see the `tokens_contract_token_idx` constraint. An unscoped
   * `eq(tokenId)` would let an event from one game mutate another game's
   * token whenever the two ids coincide, which the layout permits.
   */
  const tokenRow = (eventAddress: string, tokenId: bigint) =>
    and(
      eq(schema.tokens.contractAddress, eventAddress),
      eq(schema.tokens.tokenId, toId(tokenId)),
    );

  console.log("[Denshokan Indexer] Games:", normalizedGames.join(", "));
  console.log("[Denshokan Indexer] Stream:", streamUrl);
  console.log("[Denshokan Indexer] Starting Block:", startingBlock.toString());

  const database = drizzle({ schema, connectionString: databaseUrl });

  // Token URI fetching runs as a separate process (scripts/fetch-token-uris.ts).
  // The indexer makes zero RPC calls — it only marks tokens as needing a refetch
  // on MetadataUpdate events.

  return defineIndexer(StarknetStream)({
    streamUrl,
    finality: "accepted",
    startingBlock,
    filter: {
      events: [
        // Each game emits its own Transfer / MetadataUpdate /
        // MinterRegistryUpdate / ObjectiveCreated / SettingsCreated. There is
        // no registry counterpart: game metadata is not emitted on-chain at
        // all, and is parsed out of token URIs by the fetcher instead.
        ...normalizedGames.map((address) => ({
          address: address as `0x${string}`,
        })),
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
              // Token contracts only: the legacy denshokan, or any declared
              // self-bound game. The registry also sits in the event filter
              // and must not be read as a token.
              if (eventAddress && !isTokenContract(eventAddress)) break;

              const decoded = decodeTransfer(keys, data);
              const isMint = decoded.from === "0x0";

              if (isMint) {
                // Mint: decode the packed id using THIS contract's layout.
                // The id carries no generation marker, so the address is the
                // only thing that can tell us which one to use.
                const packed = decodePackedTokenId(decoded.tokenId);
                logger.info(
                  `${blk} Transfer (mint): token_id=${decoded.tokenId}, ` +
                  `to=${decoded.to}, game=${eventAddress}`
                );

                await db.insert(schema.tokens).values({
                  tokenId: toId(decoded.tokenId),
                  contractAddress: eventAddress,
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
                  metadata: packed.metadata.toString(),
                  ownerAddress: decoded.to,
                  mintedTo: decoded.to,
                  createdAtBlock: blockNumber,
                  lastUpdatedBlock: blockNumber,
                  lastUpdatedAt: blockTimestamp,
                }).onConflictDoUpdate({
                  // Identity is (contract, id): a token id is only unique
                  // within the ERC721 that issued it, and standard ids carry
                  // nothing that separates one game from another.
                  target: [schema.tokens.contractAddress, schema.tokens.tokenId],
                  set: {
                    ownerAddress: decoded.to,
                    // Conflict on a mint = replay/re-org of the mint event
                    // itself, so minted_to is the same fact re-observed.
                    mintedTo: decoded.to,
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
                  // Scoped to the emitting contract — without it, a transfer
                  // in one game could move ownership on another game's token
                  // that happens to share the id.
                  .where(tokenRow(eventAddress, decoded.tokenId));
              }

              break;
            }

            case EVENT_SELECTORS.MinterRegistryUpdate: {
              // Token contracts only — the registry shares this event filter
              // and never emits minter registrations.
              if (eventAddress && !isTokenContract(eventAddress)) break;

              const decoded = decodeMinterRegistryUpdate(keys, data);
              const tokenContract = eventAddress;
              logger.info(
                `${blk} MinterRegistryUpdate: token_contract=${tokenContract}, ` +
                `minter_id=${decoded.minterId}, address=${decoded.minterAddress}`
              );

              await db.insert(schema.minters).values({
                minterId: decoded.minterId,
                // `minter_counter` is per-contract storage upstream, so this
                // id means nothing without the contract that issued it: every
                // game assigns minter_id 1 to its own first minter.
                tokenContractAddress: tokenContract,
                contractAddress: decoded.minterAddress,
                blockNumber,
              }).onConflictDoUpdate({
                target: [schema.minters.tokenContractAddress, schema.minters.minterId],
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

            case EVENT_SELECTORS.MetadataUpdate: {
              if (eventAddress && !isTokenContract(eventAddress)) break;

              const decoded = decodeMetadataUpdate(keys);
              logger.info(`${blk} MetadataUpdate: token_id=${decoded.tokenId}`);

              // Mark token for URI refetch — the standalone fetcher process
              // picks it up within its poll interval (default 30s).
              //
              // Also lift any prior quarantine: a fresh MetadataUpdate proves
              // the on-chain state changed, which invalidates the "permanently
              // failing" assumption from a previous fetch burst. Without this
              // reset, a token quarantined earlier (e.g. a transient RPC blip)
              // would be skipped forever by the fetcher's
              // token_uri_fetch_failed = false gate — so game_over (and other
              // mutable state) would never be written and the token would
              // remain "active" indefinitely.
              await db
                .update(schema.tokens)
                .set({
                  tokenUriFetched: false,
                  tokenUriFetchFailed: false,
                  tokenUriFetchLastError: null,
                  // Advance the dirty marker so the fetcher can detect whether
                  // a newer update arrived while its RPC call was in flight.
                  metadataUpdateBlock: blockNumber,
                })
                .where(tokenRow(eventAddress, decoded.tokenId));
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
