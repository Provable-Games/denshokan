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
 * Packed Token ID Layout (251 bits in felt252, u128-aligned):
 *
 * Low u128 (bits 0-127):
 * | Bits      | Field          | Size     | Max Value                    |
 * |-----------|----------------|----------|------------------------------|
 * | 0-29      | game_id        | 30 bits  | ~1 billion games             |
 * | 30-69     | minted_by      | 40 bits  | ~1 trillion minters          |
 * | 70-99     | settings_id    | 30 bits  | ~1 billion settings          |
 * | 100-124   | start_delay    | 25 bits  | Relative offset              |
 * | 125       | soulbound      | 1 bit    | bool                         |
 * | 126       | has_context    | 1 bit    | bool                         |
 * | 127       | paymaster      | 1 bit    | bool                         |
 *
 * High u128 (bits 128-250):
 * | 128-162   | minted_at      | 35 bits  | Unix timestamp (~1000 years) |
 * | 163-187   | end_delay      | 25 bits  | Relative offset              |
 * | 188-217   | objective_id   | 30 bits  | ~1 billion objectives        |
 * | 218-227   | tx_hash        | 10 bits  | Hash fragment                |
 * | 228-237   | salt           | 10 bits  | Salt value                   |
 * | 238-250   | metadata       | 13 bits  | Metadata flags               |
 *
 * Events indexed:
 * - Transfer: ERC721 mint/transfer
 * - MetadataUpdate: ERC-4906 — triggers token_uri re-fetch for score, game_over, player_name, etc.
 * - MinterRegistryUpdate: Emitted when minter is registered/updated
 * - ObjectiveCreated: Emitted when a game objective is created
 * - SettingsCreated: Emitted when game settings are created
 * - GameRegistryUpdate: Emitted when a game is registered
 * - GameMetadataUpdate: Emitted when game metadata is updated
 * - GameRoyaltyUpdate: Emitted when game royalty fraction changes
 * - GameFeeUpdate: Emitted when per-game license/fee changes
 * - DefaultGameFeeUpdate: Emitted when default license/fee changes
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
  Transfer: hash.getSelectorFromName("Transfer"),
  MinterRegistryUpdate: hash.getSelectorFromName("MinterRegistryUpdate"),
  ObjectiveCreated: hash.getSelectorFromName("ObjectiveCreated"),
  SettingsCreated: hash.getSelectorFromName("SettingsCreated"),
  GameRegistryUpdate: hash.getSelectorFromName("GameRegistryUpdate"),
  GameMetadataUpdate: hash.getSelectorFromName("GameMetadataUpdate"),
  GameRoyaltyUpdate: hash.getSelectorFromName("GameRoyaltyUpdate"),
  GameFeeUpdate: hash.getSelectorFromName("GameFeeUpdate"),
  DefaultGameFeeUpdate: hash.getSelectorFromName("DefaultGameFeeUpdate"),
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
  SETTINGS_ID_MASK: 0x3FFFFFFFn, // 30 bits
  MINTED_AT_MASK: 0x7FFFFFFFFn, // 35 bits
  START_DELAY_MASK: 0x1FFFFFFn, // 25 bits
  END_DELAY_MASK: 0x1FFFFFFn, // 25 bits
  OBJECTIVE_ID_MASK: 0x3FFFFFFFn, // 30 bits
  SOULBOUND_MASK: 0x1n, // 1 bit
  HAS_CONTEXT_MASK: 0x1n, // 1 bit
  PAYMASTER_MASK: 0x1n, // 1 bit
  TX_HASH_MASK: 0x3FFn, // 10 bits
  SALT_MASK: 0x3FFn, // 10 bits
  METADATA_MASK: 0x1FFFn, // 13 bits
} as const;

/**
 * Bit offsets for packed token ID extraction
 */
const PACKED_TOKEN_ID_OFFSETS = {
  GAME_ID: 0n,
  MINTED_BY: 30n,
  SETTINGS_ID: 70n,
  START_DELAY: 100n,
  SOULBOUND: 125n,
  HAS_CONTEXT: 126n,
  PAYMASTER: 127n,
  MINTED_AT: 128n,
  END_DELAY: 163n,
  OBJECTIVE_ID: 188n,
  TX_HASH: 218n,
  SALT: 228n,
  METADATA: 238n,
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
  /** Settings ID (30 bits, u32) */
  settingsId: number;
  /** Mint timestamp as Date (35 bits Unix timestamp) */
  mintedAt: Date;
  /** Start delay as relative offset (25 bits) */
  startDelay: number;
  /** End delay as relative offset (25 bits) */
  endDelay: number;
  /** Objective ID (30 bits) */
  objectiveId: number;
  /** Soulbound flag (1 bit) */
  soulbound: boolean;
  /** Has context flag (1 bit) */
  hasContext: boolean;
  /** Paymaster flag (1 bit) */
  paymaster: boolean;
  /** TX hash fragment (10 bits) */
  txHash: number;
  /** Salt value (10 bits) */
  salt: number;
  /** Metadata flags (13 bits) */
  metadata: number;
}

/**
 * Decode packed token ID from a single felt252
 *
 * The token_id is a felt252 (not u256), so we decode from a single value.
 */
export function decodePackedTokenId(tokenIdFelt: string | bigint): PackedTokenId {
  const packed = typeof tokenIdFelt === "string" ? hexToBigInt(tokenIdFelt) : tokenIdFelt;

  const gameId = Number((packed >> PACKED_TOKEN_ID_OFFSETS.GAME_ID) & PACKED_TOKEN_ID_MASKS.GAME_ID_MASK);
  const mintedBy = (packed >> PACKED_TOKEN_ID_OFFSETS.MINTED_BY) & PACKED_TOKEN_ID_MASKS.MINTED_BY_MASK;
  const settingsId = Number((packed >> PACKED_TOKEN_ID_OFFSETS.SETTINGS_ID) & PACKED_TOKEN_ID_MASKS.SETTINGS_ID_MASK);
  const mintedAtRaw = Number((packed >> PACKED_TOKEN_ID_OFFSETS.MINTED_AT) & PACKED_TOKEN_ID_MASKS.MINTED_AT_MASK);
  const startDelay = Number((packed >> PACKED_TOKEN_ID_OFFSETS.START_DELAY) & PACKED_TOKEN_ID_MASKS.START_DELAY_MASK);
  const endDelay = Number((packed >> PACKED_TOKEN_ID_OFFSETS.END_DELAY) & PACKED_TOKEN_ID_MASKS.END_DELAY_MASK);
  const objectiveId = Number((packed >> PACKED_TOKEN_ID_OFFSETS.OBJECTIVE_ID) & PACKED_TOKEN_ID_MASKS.OBJECTIVE_ID_MASK);
  const soulbound = ((packed >> PACKED_TOKEN_ID_OFFSETS.SOULBOUND) & PACKED_TOKEN_ID_MASKS.SOULBOUND_MASK) === 1n;
  const hasContext = ((packed >> PACKED_TOKEN_ID_OFFSETS.HAS_CONTEXT) & PACKED_TOKEN_ID_MASKS.HAS_CONTEXT_MASK) === 1n;
  const paymaster = ((packed >> PACKED_TOKEN_ID_OFFSETS.PAYMASTER) & PACKED_TOKEN_ID_MASKS.PAYMASTER_MASK) === 1n;
  const txHash = Number((packed >> PACKED_TOKEN_ID_OFFSETS.TX_HASH) & PACKED_TOKEN_ID_MASKS.TX_HASH_MASK);
  const salt = Number((packed >> PACKED_TOKEN_ID_OFFSETS.SALT) & PACKED_TOKEN_ID_MASKS.SALT_MASK);
  const metadata = Number((packed >> PACKED_TOKEN_ID_OFFSETS.METADATA) & PACKED_TOKEN_ID_MASKS.METADATA_MASK);

  return {
    tokenId: packed,
    gameId,
    mintedBy,
    settingsId,
    mintedAt: new Date(mintedAtRaw * 1000),
    startDelay,
    endDelay,
    objectiveId,
    soulbound,
    hasContext,
    paymaster,
    txHash,
    salt,
    metadata,
  };
}

// ============ Event Data Interfaces ============

/**
 * Transfer event (ERC721)
 * Keys: [selector, from, to, token_id_low, token_id_high]
 * Data: []
 *
 * OZ ERC721 always uses u256 for token_id in Transfer events,
 * even though Denshokan uses felt252 internally. The felt252
 * value is stored as u256 (low, high) in the event keys.
 */
export interface TransferEvent {
  from: string;
  to: string;
  tokenId: bigint;
}

/**
 * MinterRegistryUpdate event
 * Keys: [selector, minter_id(u64)]
 * Data: [minter_address]
 */
export interface MinterRegistryUpdateEvent {
  minterId: bigint;
  minterAddress: string;
}

/**
 * ObjectiveCreated event
 * Keys: [selector, game_address, objective_id(u32)]
 * Data: [creator_address, name(ByteArray), description(ByteArray), objectives(Span<GameObjective>)]
 *
 * GameObjective = { name: felt252, value: felt252 }
 */
export interface ObjectiveCreatedEvent {
  gameAddress: string;
  objectiveId: number;
  creatorAddress: string;
  name: string;
  description: string;
  objectives: Record<string, string>;
  /** @deprecated Raw concatenated string kept for backward compatibility */
  objectiveData: string;
}

/**
 * SettingsCreated event
 * Keys: [selector, game_address, settings_id(u32)]
 * Data: [creator_address, name(ByteArray), description(ByteArray), settings(Span<GameSetting>)]
 *
 * GameSetting = { name: felt252, value: felt252 }
 */
export interface SettingsCreatedEvent {
  gameAddress: string;
  settingsId: number;
  creatorAddress: string;
  name: string;
  description: string;
  settings: Record<string, string>;
  /** @deprecated Raw concatenated string kept for backward compatibility */
  settingsData: string;
}

// ============ Event Decoders ============

/**
 * Decode Transfer event (ERC721)
 * Keys: [selector, from, to, token_id_low, token_id_high]
 * Data: []
 */
export function decodeTransfer(keys: readonly string[], data: readonly string[]): TransferEvent {
  return {
    from: feltToHex(keys[1]),
    to: feltToHex(keys[2]),
    tokenId: decodeU256(keys[3], keys[4]),
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
export function decodeByteArray(data: readonly string[], startIndex: number): { value: string; consumed: number } {
  const dataLen = Number(hexToBigInt(data[startIndex]));
  let result = "";
  let idx = startIndex + 1;

  // Decode full 31-byte chunks
  for (let i = 0; i < dataLen; i++) {
    const chunk = hexToBigInt(data[idx]);
    // Each chunk is 31 bytes (248 bits), but stored in felt252
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
 * Decode MinterRegistryUpdate event
 * Keys: [selector, minter_id(u64)]
 * Data: [minter_address]
 */
export function decodeMinterRegistryUpdate(keys: readonly string[], data: readonly string[]): MinterRegistryUpdateEvent {
  return {
    minterId: hexToBigInt(keys[1]),
    minterAddress: feltToHex(data[0]),
  };
}

/**
 * Decode a felt252 as a short string (up to 31 ASCII chars) or numeric string.
 * If all bytes are printable ASCII, returns the string; otherwise returns the numeric value.
 */
export function decodeFelt252AsString(felt: string | undefined | null): string {
  if (!felt) return "0";
  const val = hexToBigInt(felt);
  if (val === 0n) return "0";

  // Try to decode as short string
  const hex = val.toString(16);
  let str = "";
  let allPrintable = true;
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substr(i, 2), 16);
    if (charCode >= 32 && charCode <= 126) {
      str += String.fromCharCode(charCode);
    } else {
      allPrintable = false;
      break;
    }
  }

  // If all chars are printable ASCII and we got at least one char, return as string
  if (allPrintable && str.length > 0) return str;

  // Otherwise return numeric string
  return val.toString();
}

/**
 * Decode a Span of {name: felt252, value: felt252} pairs from felt252 array.
 * Format: [span_length, ...for each element: name(felt252), value(felt252)]
 */
export function decodeKeyValueSpan(data: readonly string[], startIndex: number): { value: Record<string, string>; consumed: number } {
  const spanLen = Number(hexToBigInt(data[startIndex]));
  let idx = startIndex + 1;
  const result: Record<string, string> = {};

  for (let i = 0; i < spanLen; i++) {
    const name = decodeFelt252AsString(data[idx]);
    idx += 1;
    const value = decodeFelt252AsString(data[idx]);
    idx += 1;
    result[name] = value;
  }

  return { value: result, consumed: idx - startIndex };
}

/**
 * Decode ObjectiveCreated event
 * Keys: [selector, game_address, objective_id(u32)]
 * Data: [creator_address, name(ByteArray), description(ByteArray), objectives(Span<GameObjective>)]
 */
export function decodeObjectiveCreated(keys: readonly string[], data: readonly string[]): ObjectiveCreatedEvent {
  let idx = 1; // skip creator_address at data[0]

  const nameResult = decodeByteArray(data, idx);
  idx += nameResult.consumed;

  const descriptionResult = decodeByteArray(data, idx);
  idx += descriptionResult.consumed;

  const objectivesResult = decodeKeyValueSpan(data, idx);

  return {
    gameAddress: feltToHex(keys[1]),
    objectiveId: Number(hexToBigInt(keys[2])),
    creatorAddress: feltToHex(data[0]),
    name: nameResult.value,
    description: descriptionResult.value,
    objectives: objectivesResult.value,
    objectiveData: `${nameResult.value}: ${descriptionResult.value}`,
  };
}

/**
 * Decode SettingsCreated event
 * Keys: [selector, game_address, settings_id(u32)]
 * Data: [creator_address, name(ByteArray), description(ByteArray), settings(Span<GameSetting>)]
 */
export function decodeSettingsCreated(keys: readonly string[], data: readonly string[]): SettingsCreatedEvent {
  let idx = 1; // skip creator_address at data[0]

  const nameResult = decodeByteArray(data, idx);
  idx += nameResult.consumed;

  const descriptionResult = decodeByteArray(data, idx);
  idx += descriptionResult.consumed;

  const settingsResult = decodeKeyValueSpan(data, idx);

  return {
    gameAddress: feltToHex(keys[1]),
    settingsId: Number(hexToBigInt(keys[2])),
    creatorAddress: feltToHex(data[0]),
    name: nameResult.value,
    description: descriptionResult.value,
    settings: settingsResult.value,
    settingsData: `${nameResult.value}: ${descriptionResult.value}`,
  };
}

/**
 * MetadataUpdate event (ERC-4906)
 * Keys: [selector, token_id_low, token_id_high]
 * Data: []
 */
export interface MetadataUpdateEvent {
  tokenId: bigint;
}

/**
 * Decode MetadataUpdate event (ERC-4906)
 * Keys: [selector, token_id_low, token_id_high]
 * Data: []
 */
export function decodeMetadataUpdate(keys: readonly string[]): MetadataUpdateEvent {
  return {
    tokenId: decodeU256(keys[1], keys[2]),
  };
}

// ============ Game Registry Events ============

/**
 * GameRegistryUpdate event
 * Keys: [selector, id(u32)]
 * Data: [contract_address]
 */
export interface GameRegistryUpdateEvent {
  gameId: number;
  contractAddress: string;
}

/**
 * GameMetadataUpdate event
 * Keys: [selector, id(u32)]
 * Data: [contract_address, name(ByteArray), description(ByteArray), developer(ByteArray),
 *        publisher(ByteArray), genre(ByteArray), image(ByteArray), color(ByteArray),
 *        client_url(ByteArray), renderer_address, royalty_fraction(u128), skills_address(ContractAddress)]
 */
export interface GameMetadataUpdateEvent {
  gameId: number;
  contractAddress: string;
  name: string;
  description: string;
  developer: string;
  publisher: string;
  genre: string;
  image: string;
  color: string;
  clientUrl: string;
  rendererAddress: string;
  royaltyFraction: string;
  skillsAddress: string;
  version: number;
}

/**
 * GameRoyaltyUpdate event
 * Keys: [selector, game_id(u32)]
 * Data: [royalty_fraction(u128)]
 */
export interface GameRoyaltyUpdateEvent {
  gameId: number;
  royaltyFraction: string;
}

export function decodeGameRegistryUpdate(keys: readonly string[], data: readonly string[]): GameRegistryUpdateEvent {
  return {
    gameId: Number(hexToBigInt(keys[1])),
    contractAddress: feltToHex(data[0]),
  };
}

export function decodeGameMetadataUpdate(keys: readonly string[], data: readonly string[]): GameMetadataUpdateEvent {
  const contractAddress = feltToHex(data[0]);
  let idx = 1;

  const name = decodeByteArray(data, idx);
  idx += name.consumed;

  const description = decodeByteArray(data, idx);
  idx += description.consumed;

  const developer = decodeByteArray(data, idx);
  idx += developer.consumed;

  const publisher = decodeByteArray(data, idx);
  idx += publisher.consumed;

  const genre = decodeByteArray(data, idx);
  idx += genre.consumed;

  const image = decodeByteArray(data, idx);
  idx += image.consumed;

  const color = decodeByteArray(data, idx);
  idx += color.consumed;

  const clientUrl = decodeByteArray(data, idx);
  idx += clientUrl.consumed;

  const rendererAddress = feltToHex(data[idx]);
  idx += 1;

  const royaltyFraction = hexToBigInt(data[idx]).toString();
  idx += 1;

  const skillsAddress = feltToHex(data[idx]);
  idx += 1;

  const version = Number(hexToBigInt(data[idx]));

  return {
    gameId: Number(hexToBigInt(keys[1])),
    contractAddress,
    name: name.value,
    description: description.value,
    developer: developer.value,
    publisher: publisher.value,
    genre: genre.value,
    image: image.value,
    color: color.value,
    clientUrl: clientUrl.value,
    rendererAddress,
    royaltyFraction,
    skillsAddress,
    version,
  };
}

export function decodeGameRoyaltyUpdate(keys: readonly string[], data: readonly string[]): GameRoyaltyUpdateEvent {
  return {
    gameId: Number(hexToBigInt(keys[1])),
    royaltyFraction: hexToBigInt(data[0]).toString(),
  };
}

// ============ Game Fee Events ============

/**
 * GameFeeUpdate event
 * Keys: [selector, game_id(u64)]
 * Data: [license(ByteArray), fee_numerator(u16)]
 */
export interface GameFeeUpdateEvent {
  gameId: number;
  license: string;
  feeNumerator: number;
}

/**
 * DefaultGameFeeUpdate event
 * Keys: [selector]
 * Data: [license(ByteArray), fee_numerator(u16)]
 */
export interface DefaultGameFeeUpdateEvent {
  license: string;
  feeNumerator: number;
}

export function decodeGameFeeUpdate(keys: readonly string[], data: readonly string[]): GameFeeUpdateEvent {
  const gameId = Number(hexToBigInt(keys[1]));
  let idx = 0;
  const license = decodeByteArray(data, idx);
  idx += license.consumed;
  const feeNumerator = Number(hexToBigInt(data[idx]));
  return { gameId, license: license.value, feeNumerator };
}

export function decodeDefaultGameFeeUpdate(_keys: readonly string[], data: readonly string[]): DefaultGameFeeUpdateEvent {
  let idx = 0;
  const license = decodeByteArray(data, idx);
  idx += license.consumed;
  const feeNumerator = Number(hexToBigInt(data[idx]));
  return { license: license.value, feeNumerator };
}

// ============ Token URI Parsing ============

/**
 * Parsed attributes extracted from token URI metadata JSON.
 * Null values indicate the attribute was not found in the URI.
 */
export interface TokenUriAttributes {
  score: bigint | null;
  gameOver: boolean | null;
  completedObjectives: boolean | null;
  completedAt: number | null;
  playerName: string | null;
  contextName: string | null;
  contextId: number | null;
  clientUrl: string | null;
  rendererAddress: string | null;
  skillsAddress: string | null;
}

/**
 * Parse token URI to extract mutable token attributes from the NFT metadata.
 *
 * Handles both data:application/json;base64,... URIs and plain JSON strings.
 *
 * Attributes extracted:
 *   Score, Game Over, Objectives Completed, Player Name, Context Name, Context ID
 */
export function parseTokenUriAttributes(uri: string): TokenUriAttributes {
  const result: TokenUriAttributes = {
    score: null,
    gameOver: null,
    completedObjectives: null,
    completedAt: null,
    playerName: null,
    contextName: null,
    contextId: null,
    clientUrl: null,
    rendererAddress: null,
    skillsAddress: null,
  };

  try {
    let json: string;

    if (uri.startsWith("data:application/json;base64,")) {
      json = Buffer.from(uri.slice("data:application/json;base64,".length), "base64").toString("utf-8");
    } else if (uri.startsWith("data:application/json,")) {
      json = decodeURIComponent(uri.slice("data:application/json,".length));
    } else if (uri.startsWith("{")) {
      json = uri;
    } else {
      return result;
    }

    const metadata = JSON.parse(json);
    const attributes: Array<{ trait_type?: string; trait?: string; value: string }> = metadata.attributes;
    if (!Array.isArray(attributes)) return result;

    for (const attr of attributes) {
      const traitName = attr.trait_type ?? attr.trait;
      switch (traitName) {
        case "Score":
          result.score = BigInt(attr.value);
          break;
        case "Game Over":
          result.gameOver = attr.value.toLowerCase() === "true";
          break;
        case "Objectives Completed":
          result.completedObjectives = attr.value.toLowerCase() === "true";
          break;
        case "Completed At":
          result.completedAt = attr.value ? Number(attr.value) : null;
          break;
        case "Player Name":
          result.playerName = attr.value || null;
          break;
        case "Context Name":
          result.contextName = attr.value || null;
          break;
        case "Context ID":
          result.contextId = attr.value ? Number(attr.value) : null;
          break;
        case "Client URL":
          result.clientUrl = attr.value || null;
          break;
        case "Renderer":
          result.rendererAddress = attr.value || null;
          break;
        case "Skills":
          result.skillsAddress = attr.value || null;
          break;
      }
    }
  } catch {
    // Parse failure — return nulls so caller can skip attribute updates
  }

  return result;
}
