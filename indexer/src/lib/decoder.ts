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
 * - ScoreUpdate: Emitted when token score changes
 * - TokenPlayerNameUpdate: Emitted when player name is set
 * - TokenClientUrlUpdate: Emitted when client URL is set
 * - GameOver: Emitted when game ends for a token
 * - CompletedObjective: Emitted when token completes all objectives
 * - MinterRegistryUpdate: Emitted when minter is registered/updated
 * - TokenContextUpdate: Emitted when token context data is set
 * - ObjectiveCreated: Emitted when a game objective is created
 * - SettingsCreated: Emitted when game settings are created
 * - TokenRendererUpdate: Emitted when token renderer is updated
 * - GameRegistryUpdate: Emitted when a game is registered
 * - GameMetadataUpdate: Emitted when game metadata is updated
 * - GameRoyaltyUpdate: Emitted when game royalty fraction changes
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
  ScoreUpdate: hash.getSelectorFromName("ScoreUpdate"),
  TokenPlayerNameUpdate: hash.getSelectorFromName("TokenPlayerNameUpdate"),
  TokenClientUrlUpdate: hash.getSelectorFromName("TokenClientUrlUpdate"),
  GameOver: hash.getSelectorFromName("GameOver"),
  CompletedObjective: hash.getSelectorFromName("CompletedObjective"),
  MinterRegistryUpdate: hash.getSelectorFromName("MinterRegistryUpdate"),
  TokenContextUpdate: hash.getSelectorFromName("TokenContextUpdate"),
  ObjectiveCreated: hash.getSelectorFromName("ObjectiveCreated"),
  SettingsCreated: hash.getSelectorFromName("SettingsCreated"),
  TokenRendererUpdate: hash.getSelectorFromName("TokenRendererUpdate"),
  GameRegistryUpdate: hash.getSelectorFromName("GameRegistryUpdate"),
  GameMetadataUpdate: hash.getSelectorFromName("GameMetadataUpdate"),
  GameRoyaltyUpdate: hash.getSelectorFromName("GameRoyaltyUpdate"),
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
 * ScoreUpdate event
 * Keys: [selector, token_id]
 * Data: [score]
 */
export interface ScoreUpdateEvent {
  tokenId: bigint;
  score: bigint;
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
 */
export interface TokenClientUrlUpdateEvent {
  id: bigint;
  clientUrl: string;
}

/**
 * GameOver event
 * Keys: [selector, token_id(u64)]
 * Data: []
 */
export interface GameOverEvent {
  tokenId: bigint;
}

/**
 * CompletedObjective event
 * Keys: [selector, token_id(u64)]
 * Data: []
 */
export interface CompletedObjectiveEvent {
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
 * TokenContextUpdate event
 * Keys: [selector, token_id(u64)]
 * Data: [data(ByteArray)]
 */
export interface TokenContextUpdateEvent {
  tokenId: bigint;
  data: string;
}

/**
 * ObjectiveCreated event
 * Keys: [selector, game_address, objective_id(u32), settings_id(u32)]
 * Data: [creator_address, name(ByteArray), description(ByteArray), objectives(Span<GameObjective>)]
 *
 * GameObjective = { name: ByteArray, value: ByteArray }
 */
export interface ObjectiveCreatedEvent {
  gameAddress: string;
  objectiveId: number;
  settingsId: number;
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
 * GameSetting = { name: ByteArray, value: ByteArray }
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

/**
 * TokenRendererUpdate event
 * Keys: [selector, token_id(u64)]
 * Data: [renderer(ContractAddress)]
 */
export interface TokenRendererUpdateEvent {
  tokenId: bigint;
  renderer: string;
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
 * Decode GameOver event
 * Keys: [selector, token_id(u64)]
 * Data: []
 */
export function decodeGameOver(keys: readonly string[]): GameOverEvent {
  return {
    tokenId: hexToBigInt(keys[1]),
  };
}

/**
 * Decode CompletedObjective event
 * Keys: [selector, token_id(u64)]
 * Data: []
 */
export function decodeCompletedObjective(keys: readonly string[]): CompletedObjectiveEvent {
  return {
    tokenId: hexToBigInt(keys[1]),
  };
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
 * Decode TokenContextUpdate event
 * Keys: [selector, token_id(u64)]
 * Data: [data(ByteArray)]
 */
export function decodeTokenContextUpdate(keys: readonly string[], data: readonly string[]): TokenContextUpdateEvent {
  const { value } = decodeByteArray(data, 0);
  return {
    tokenId: hexToBigInt(keys[1]),
    data: value,
  };
}

/**
 * Decode a Span of {name: ByteArray, value: ByteArray} pairs from felt252 array.
 * Format: [span_length, ...for each element: name(ByteArray), value(ByteArray)]
 */
export function decodeKeyValueSpan(data: readonly string[], startIndex: number): { value: Record<string, string>; consumed: number } {
  const spanLen = Number(hexToBigInt(data[startIndex]));
  let idx = startIndex + 1;
  const result: Record<string, string> = {};

  for (let i = 0; i < spanLen; i++) {
    const nameResult = decodeByteArray(data, idx);
    idx += nameResult.consumed;
    const valueResult = decodeByteArray(data, idx);
    idx += valueResult.consumed;
    result[nameResult.value] = valueResult.value;
  }

  return { value: result, consumed: idx - startIndex };
}

/**
 * Decode ObjectiveCreated event
 * Keys: [selector, game_address, objective_id(u32), settings_id(u32)]
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
    settingsId: Number(hexToBigInt(keys[3])),
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
 * Decode TokenRendererUpdate event
 * Keys: [selector, token_id(u64)]
 * Data: [renderer(ContractAddress)]
 */
export function decodeTokenRendererUpdate(keys: readonly string[], data: readonly string[]): TokenRendererUpdateEvent {
  return {
    tokenId: hexToBigInt(keys[1]),
    renderer: feltToHex(data[0]),
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
 *        client_url(ByteArray), renderer_address, royalty_fraction(u128), agent_skills(ByteArray)]
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
  agentSkills: string;
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

  const agentSkills = decodeByteArray(data, idx);

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
    agentSkills: agentSkills.value,
  };
}

export function decodeGameRoyaltyUpdate(keys: readonly string[], data: readonly string[]): GameRoyaltyUpdateEvent {
  return {
    gameId: Number(hexToBigInt(keys[1])),
    royaltyFraction: hexToBigInt(data[0]).toString(),
  };
}
