/**
 * Denshokan Event Decoder Utilities
 *
 * Provides helper functions for decoding Starknet event data from felt252 arrays.
 * Cairo types are serialized as follows:
 * - felt252: 1 field element
 * - u128: 1 field element
 * - u64: 1 field element
 * - u32: 1 field element
 * - u16: 1 field element
 * - u8: 1 field element
 * - bool: 1 field element (0 or 1)
 * - u256: 2 field elements (low, high)
 * - ContractAddress: 1 field element
 *
 * Packed Token ID Layout (239 bits in felt252):
 * | Bits      | Field            | Size     | Max Value                |
 * |-----------|------------------|----------|--------------------------|
 * | 0-29      | game_id          | 30 bits  | ~1 billion games         |
 * | 30-69     | minted_by        | 40 bits  | ~1 trillion minters      |
 * | 70-101    | settings_id      | 32 bits  | ~4 billion settings      |
 * | 102-136   | minted_at        | 35 bits  | Unix timestamp (~1000 years) |
 * | 137-162   | lifecycle_start  | 26 bits  | Relative timestamp       |
 * | 163-188   | lifecycle_end    | 26 bits  | Relative timestamp       |
 * | 189-196   | objectives_count | 8 bits   | 255 objectives           |
 * | 197       | soulbound        | 1 bit    | bool                     |
 * | 198       | has_context      | 1 bit    | bool                     |
 * | 199-238   | sequence_number  | 40 bits  | ~1 trillion tokens       |
 *
 * Events indexed:
 * - ScoreUpdate: Emitted when token score changes
 * - TokenMetadataUpdate: Emitted on mint or metadata change
 * - TokenPlayerNameUpdate: Emitted when player name is set
 * - TokenClientUrlUpdate: Emitted when client URL is set
 * - MetadataUpdate: ERC721 standard metadata refresh event
 */

import { hash } from "starknet";

/**
 * JSON stringify that handles BigInt values
 * Converts BigInt to string representation
 */
export function stringifyWithBigInt(obj: unknown): string {
  return JSON.stringify(obj, (_, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

/**
 * Event selectors (starknet_keccak of event name)
 */
export const EVENT_SELECTORS = {
  ScoreUpdate: hash.getSelectorFromName("ScoreUpdate"),
  TokenMetadataUpdate: hash.getSelectorFromName("TokenMetadataUpdate"),
  TokenPlayerNameUpdate: hash.getSelectorFromName("TokenPlayerNameUpdate"),
  TokenClientUrlUpdate: hash.getSelectorFromName("TokenClientUrlUpdate"),
  MetadataUpdate: hash.getSelectorFromName("MetadataUpdate"),
} as const;

/**
 * Convert a hex string to bigint
 */
export function hexToBigInt(hex: string | undefined | null): bigint {
  if (!hex) return 0n;
  return BigInt(hex);
}

/**
 * Decode a u256 from two felt252s (low, high)
 */
export function decodeU256(low: string | undefined, high: string | undefined): bigint {
  const lowVal = hexToBigInt(low);
  const highVal = hexToBigInt(high);
  return (highVal << 128n) + lowVal;
}

/**
 * Convert felt252 to string (for contract addresses, short strings)
 * Normalizes to unpadded lowercase hex (e.g., "0x2e0a..." not "0x02e0a...")
 */
export function feltToHex(felt: string | undefined | null): string {
  if (!felt) return "0x0";
  // Convert to BigInt and back to hex to normalize (removes leading zeros)
  return `0x${BigInt(felt).toString(16)}`;
}

/**
 * Decode bool from felt252 (0 = false, 1 = true)
 */
export function decodeBool(felt: string | undefined): boolean {
  return hexToBigInt(felt) === 1n;
}

/**
 * Decode felt252 short string to ASCII string
 */
export function feltToString(felt: string | undefined | null): string {
  if (!felt) return "";
  const val = hexToBigInt(felt);
  if (val === 0n) return "";

  const hex = val.toString(16);
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substr(i, 2), 16);
    if (charCode > 0) str += String.fromCharCode(charCode);
  }
  return str;
}

// ============ Packed Token ID ============

/**
 * Bit masks for packed token ID extraction
 * These match the Cairo implementation in structs.cairo
 */
const PACKED_TOKEN_ID_MASKS = {
  GAME_ID_MASK: 0x3FFFFFFFn, // 30 bits
  MINTED_BY_MASK: 0xFFFFFFFFFFn, // 40 bits
  SETTINGS_ID_MASK: 0xFFFFFFFFn, // 32 bits
  MINTED_AT_MASK: 0x7FFFFFFFFn, // 35 bits
  LIFECYCLE_START_MASK: 0x3FFFFFFn, // 26 bits
  LIFECYCLE_END_MASK: 0x3FFFFFFn, // 26 bits
  OBJECTIVES_COUNT_MASK: 0xFFn, // 8 bits
  SOULBOUND_MASK: 0x1n, // 1 bit
  HAS_CONTEXT_MASK: 0x1n, // 1 bit
  SEQUENCE_NUMBER_MASK: 0xFFFFFFFFFFn, // 40 bits
} as const;

/**
 * Bit offsets for packed token ID extraction
 */
const PACKED_TOKEN_ID_OFFSETS = {
  GAME_ID: 0n,
  MINTED_BY: 30n,
  SETTINGS_ID: 70n,
  MINTED_AT: 102n,
  LIFECYCLE_START: 137n,
  LIFECYCLE_END: 163n,
  OBJECTIVES_COUNT: 189n,
  SOULBOUND: 197n,
  HAS_CONTEXT: 198n,
  SEQUENCE_NUMBER: 199n,
} as const;

/**
 * Decoded packed token ID structure
 */
export interface PackedTokenId {
  /** Raw token ID as bigint */
  tokenId: bigint;
  /** Game ID (30 bits, u32) */
  gameId: number;
  /** Minter ID (40 bits, u64) */
  mintedBy: bigint;
  /** Settings ID (32 bits, u32) */
  settingsId: number;
  /** Mint timestamp as Date (35 bits Unix timestamp) */
  mintedAt: Date;
  /** Lifecycle start as relative offset (26 bits) */
  lifecycleStart: number;
  /** Lifecycle end as relative offset (26 bits) */
  lifecycleEnd: number;
  /** Number of objectives (8 bits, u8) */
  objectivesCount: number;
  /** Soulbound flag (1 bit) */
  soulbound: boolean;
  /** Has context flag (1 bit) */
  hasContext: boolean;
  /** Sequence number for uniqueness (40 bits, u64) */
  sequenceNumber: bigint;
}

/**
 * Decode packed token ID from a single felt252
 *
 * The token_id is a felt252 (not u256), so we decode from a single value.
 * This is different from kandoswap which uses u256 (low/high).
 */
export function decodePackedTokenId(tokenIdFelt: string | bigint): PackedTokenId {
  const packed = typeof tokenIdFelt === "string" ? hexToBigInt(tokenIdFelt) : tokenIdFelt;

  const gameId = Number((packed >> PACKED_TOKEN_ID_OFFSETS.GAME_ID) & PACKED_TOKEN_ID_MASKS.GAME_ID_MASK);
  const mintedBy = (packed >> PACKED_TOKEN_ID_OFFSETS.MINTED_BY) & PACKED_TOKEN_ID_MASKS.MINTED_BY_MASK;
  const settingsId = Number((packed >> PACKED_TOKEN_ID_OFFSETS.SETTINGS_ID) & PACKED_TOKEN_ID_MASKS.SETTINGS_ID_MASK);
  const mintedAtRaw = Number((packed >> PACKED_TOKEN_ID_OFFSETS.MINTED_AT) & PACKED_TOKEN_ID_MASKS.MINTED_AT_MASK);
  const lifecycleStart = Number((packed >> PACKED_TOKEN_ID_OFFSETS.LIFECYCLE_START) & PACKED_TOKEN_ID_MASKS.LIFECYCLE_START_MASK);
  const lifecycleEnd = Number((packed >> PACKED_TOKEN_ID_OFFSETS.LIFECYCLE_END) & PACKED_TOKEN_ID_MASKS.LIFECYCLE_END_MASK);
  const objectivesCount = Number((packed >> PACKED_TOKEN_ID_OFFSETS.OBJECTIVES_COUNT) & PACKED_TOKEN_ID_MASKS.OBJECTIVES_COUNT_MASK);
  const soulbound = ((packed >> PACKED_TOKEN_ID_OFFSETS.SOULBOUND) & PACKED_TOKEN_ID_MASKS.SOULBOUND_MASK) === 1n;
  const hasContext = ((packed >> PACKED_TOKEN_ID_OFFSETS.HAS_CONTEXT) & PACKED_TOKEN_ID_MASKS.HAS_CONTEXT_MASK) === 1n;
  const sequenceNumber = (packed >> PACKED_TOKEN_ID_OFFSETS.SEQUENCE_NUMBER) & PACKED_TOKEN_ID_MASKS.SEQUENCE_NUMBER_MASK;

  return {
    tokenId: packed,
    gameId,
    mintedBy,
    settingsId,
    mintedAt: new Date(mintedAtRaw * 1000),
    lifecycleStart,
    lifecycleEnd,
    objectivesCount,
    soulbound,
    hasContext,
    sequenceNumber,
  };
}

// ============ Event Data Interfaces ============

/**
 * ScoreUpdate event
 * Keys: [selector, token_id]
 * Data: [score]
 */
export interface ScoreUpdateEvent {
  tokenId: bigint;
  score: bigint;
}

/**
 * TokenMetadataUpdate event
 * Keys: [selector, id]
 * Data: [game_id, minted_at, settings_id, lifecycle_start, lifecycle_end,
 *        minted_by, soulbound, game_over, completed_all_objectives,
 *        has_context, objectives_count]
 */
export interface TokenMetadataUpdateEvent {
  id: bigint;
  gameId: bigint;
  mintedAt: bigint;
  settingsId: number;
  lifecycleStart: bigint;
  lifecycleEnd: bigint;
  mintedBy: bigint;
  soulbound: boolean;
  gameOver: boolean;
  completedAllObjectives: boolean;
  hasContext: boolean;
  objectivesCount: number;
}

/**
 * TokenPlayerNameUpdate event
 * Keys: [selector, id]
 * Data: [player_name]
 */
export interface TokenPlayerNameUpdateEvent {
  id: bigint;
  playerName: string;
}

/**
 * TokenClientUrlUpdate event
 * Keys: [selector, id]
 * Data: [client_url (ByteArray)]
 *
 * ByteArray format: [data_len, pending_word, pending_word_len]
 * For short strings: data_len=0, pending_word=string, pending_word_len
 */
export interface TokenClientUrlUpdateEvent {
  id: bigint;
  clientUrl: string;
}

/**
 * MetadataUpdate event (ERC721 standard)
 * Keys: [selector, token_id_low, token_id_high]
 * Data: []
 */
export interface MetadataUpdateEvent {
  tokenId: bigint;
}

// ============ Event Decoders ============

/**
 * Decode ScoreUpdate event
 * Keys: [selector, token_id]
 * Data: [score]
 */
export function decodeScoreUpdate(keys: readonly string[], data: readonly string[]): ScoreUpdateEvent {
  return {
    tokenId: hexToBigInt(keys[1]),
    score: hexToBigInt(data[0]),
  };
}

/**
 * Decode TokenMetadataUpdate event
 * Keys: [selector, id]
 * Data: [game_id, minted_at, settings_id, lifecycle_start, lifecycle_end,
 *        minted_by, soulbound, game_over, completed_all_objectives,
 *        has_context, objectives_count]
 */
export function decodeTokenMetadataUpdate(keys: readonly string[], data: readonly string[]): TokenMetadataUpdateEvent {
  return {
    id: hexToBigInt(keys[1]),
    gameId: hexToBigInt(data[0]),
    mintedAt: hexToBigInt(data[1]),
    settingsId: Number(hexToBigInt(data[2])),
    lifecycleStart: hexToBigInt(data[3]),
    lifecycleEnd: hexToBigInt(data[4]),
    mintedBy: hexToBigInt(data[5]),
    soulbound: decodeBool(data[6]),
    gameOver: decodeBool(data[7]),
    completedAllObjectives: decodeBool(data[8]),
    hasContext: decodeBool(data[9]),
    objectivesCount: Number(hexToBigInt(data[10])),
  };
}

/**
 * Decode TokenPlayerNameUpdate event
 * Keys: [selector, id]
 * Data: [player_name]
 */
export function decodeTokenPlayerNameUpdate(keys: readonly string[], data: readonly string[]): TokenPlayerNameUpdateEvent {
  return {
    id: hexToBigInt(keys[1]),
    playerName: feltToString(data[0]),
  };
}

/**
 * Decode ByteArray from felt252 array
 * Cairo ByteArray format:
 * - data: Array<bytes31> - full 31-byte chunks
 * - pending_word: felt252 - remaining bytes
 * - pending_word_len: usize - length of pending_word
 *
 * Serialized format: [data_len, ...data_chunks, pending_word, pending_word_len]
 */
function decodeByteArray(data: readonly string[], startIndex: number): { value: string; consumed: number } {
  const dataLen = Number(hexToBigInt(data[startIndex]));
  let result = "";
  let idx = startIndex + 1;

  // Decode full 31-byte chunks
  for (let i = 0; i < dataLen; i++) {
    const chunk = hexToBigInt(data[idx]);
    // Each chunk is 31 bytes (248 bits), but stored in felt252
    // Decode as hex, then convert to string
    const hex = chunk.toString(16).padStart(62, "0"); // 31 bytes = 62 hex chars
    for (let j = 0; j < 62; j += 2) {
      const charCode = parseInt(hex.substr(j, 2), 16);
      if (charCode > 0) result += String.fromCharCode(charCode);
    }
    idx++;
  }

  // Decode pending word (remaining bytes)
  const pendingWord = hexToBigInt(data[idx]);
  const pendingWordLen = Number(hexToBigInt(data[idx + 1]));

  if (pendingWordLen > 0) {
    const hex = pendingWord.toString(16).padStart(pendingWordLen * 2, "0");
    for (let i = 0; i < hex.length; i += 2) {
      const charCode = parseInt(hex.substr(i, 2), 16);
      if (charCode > 0) result += String.fromCharCode(charCode);
    }
  }

  return { value: result, consumed: 1 + dataLen + 2 };
}

/**
 * Decode TokenClientUrlUpdate event
 * Keys: [selector, id]
 * Data: [client_url (ByteArray)]
 */
export function decodeTokenClientUrlUpdate(keys: readonly string[], data: readonly string[]): TokenClientUrlUpdateEvent {
  const { value: clientUrl } = decodeByteArray(data, 0);
  return {
    id: hexToBigInt(keys[1]),
    clientUrl,
  };
}

/**
 * Decode MetadataUpdate event (ERC721 standard)
 * Keys: [selector, token_id_low, token_id_high]
 * Data: []
 */
export function decodeMetadataUpdate(keys: readonly string[]): MetadataUpdateEvent {
  return {
    tokenId: decodeU256(keys[1], keys[2]),
  };
}
