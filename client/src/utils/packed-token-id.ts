/**
 * Packed Token ID decoder for client-side use
 *
 * Layout (251 bits in felt252, u128-aligned):
 *
 * Low u128 (bits 0-127):
 * | Bits      | Field        | Size     |
 * |-----------|--------------|----------|
 * | 0-29      | game_id      | 30 bits  |
 * | 30-69     | minted_by    | 40 bits  |
 * | 70-99     | settings_id  | 30 bits  |
 * | 100-124   | start_delay  | 25 bits  |
 * | 125       | soulbound    | 1 bit    |
 * | 126       | has_context   | 1 bit    |
 * | 127       | paymaster    | 1 bit    |
 *
 * High u128 (bits 128-250):
 * | 128-162   | minted_at    | 35 bits  |
 * | 163-187   | end_delay    | 25 bits  |
 * | 188-217   | objective_id | 30 bits  |
 * | 218-227   | tx_hash      | 10 bits  |
 * | 228-237   | salt         | 10 bits  |
 * | 238-250   | metadata     | 13 bits  |
 */

export interface DecodedTokenId {
  tokenId: bigint;
  gameId: number;
  mintedBy: bigint;
  settingsId: number;
  mintedAt: Date;
  startDelay: number;
  endDelay: number;
  objectiveId: number;
  soulbound: boolean;
  hasContext: boolean;
  paymaster: boolean;
  txHash: number;
  salt: number;
  metadata: number;
}

const MASKS = {
  GAME_ID: 0x3FFFFFFFn,
  MINTED_BY: 0xFFFFFFFFFFn,
  SETTINGS_ID: 0x3FFFFFFFn,
  MINTED_AT: 0x7FFFFFFFFn,
  START_DELAY: 0x1FFFFFFn,
  END_DELAY: 0x1FFFFFFn,
  OBJECTIVE_ID: 0x3FFFFFFFn,
  BOOL: 0x1n,
  TX_HASH: 0x3FFn,
  SALT: 0x3FFn,
  METADATA: 0x1FFFn,
} as const;

const OFFSETS = {
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

export function decodePackedTokenId(tokenId: string | bigint): DecodedTokenId {
  const packed = typeof tokenId === "string" ? BigInt(tokenId) : tokenId;

  return {
    tokenId: packed,
    gameId: Number((packed >> OFFSETS.GAME_ID) & MASKS.GAME_ID),
    mintedBy: (packed >> OFFSETS.MINTED_BY) & MASKS.MINTED_BY,
    settingsId: Number((packed >> OFFSETS.SETTINGS_ID) & MASKS.SETTINGS_ID),
    mintedAt: new Date(Number((packed >> OFFSETS.MINTED_AT) & MASKS.MINTED_AT) * 1000),
    startDelay: Number((packed >> OFFSETS.START_DELAY) & MASKS.START_DELAY),
    endDelay: Number((packed >> OFFSETS.END_DELAY) & MASKS.END_DELAY),
    objectiveId: Number((packed >> OFFSETS.OBJECTIVE_ID) & MASKS.OBJECTIVE_ID),
    soulbound: ((packed >> OFFSETS.SOULBOUND) & MASKS.BOOL) === 1n,
    hasContext: ((packed >> OFFSETS.HAS_CONTEXT) & MASKS.BOOL) === 1n,
    paymaster: ((packed >> OFFSETS.PAYMASTER) & MASKS.BOOL) === 1n,
    txHash: Number((packed >> OFFSETS.TX_HASH) & MASKS.TX_HASH),
    salt: Number((packed >> OFFSETS.SALT) & MASKS.SALT),
    metadata: Number((packed >> OFFSETS.METADATA) & MASKS.METADATA),
  };
}
