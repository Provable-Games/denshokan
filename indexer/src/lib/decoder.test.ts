import { describe, expect, it } from "vitest";

import { decodePackedTokenId } from "./decoder.js";

/**
 * Token-id decoding is the one thing in this indexer that fails SILENTLY.
 *
 * Both generations pack a felt252. Neither carries a marker saying which
 * layout it uses. Decode a standard id with the legacy layout and nothing
 * throws — you get a timestamp, a settings id, a minter id, all plausible and
 * all wrong, written straight into the database.
 *
 * So these tests pack the bits independently of the decoder's own constants.
 * If an offset in decoder.ts is wrong by even one bit, the round trip fails
 * here rather than in production six months later.
 */

/** Pack a legacy id from its documented bit positions. */
function packLegacy(f: {
  gameId: bigint;
  mintedBy: bigint;
  settingsId: bigint;
  startDelay: bigint;
  soulbound: boolean;
  hasContext: boolean;
  paymaster: boolean;
  mintedAt: bigint;
  endDelay: bigint;
  objectiveId: bigint;
  txHash: bigint;
  salt: bigint;
  metadata: bigint;
}): bigint {
  return (
    f.gameId |
    (f.mintedBy << 30n) |
    (f.settingsId << 70n) |
    (f.startDelay << 100n) |
    (BigInt(f.soulbound) << 125n) |
    (BigInt(f.hasContext) << 126n) |
    (BigInt(f.paymaster) << 127n) |
    (f.mintedAt << 128n) |
    (f.endDelay << 163n) |
    (f.objectiveId << 188n) |
    (f.txHash << 218n) |
    (f.salt << 228n) |
    (f.metadata << 238n)
  );
}

/** Pack a standard id from its documented bit positions. */
function packStandard(f: {
  mintedAt: bigint;
  startDelay: bigint;
  endDelay: bigint;
  settingsId: bigint;
  mintedBy: bigint;
  soulbound: boolean;
  txHash: bigint;
  salt: bigint;
  paymaster: boolean;
  hasContext: boolean;
  objectiveId: bigint;
  metadata: bigint;
}): bigint {
  const low =
    f.mintedAt |
    (f.startDelay << 35n) |
    (f.endDelay << 60n) |
    (f.settingsId << 85n) |
    (f.mintedBy << 101n) |
    (BigInt(f.soulbound) << 127n);
  const high =
    f.txHash |
    (f.salt << 10n) |
    (BigInt(f.paymaster) << 26n) |
    (BigInt(f.hasContext) << 27n) |
    (f.objectiveId << 28n) |
    (f.metadata << 58n);
  return low | (high << 128n);
}

describe("decodePackedTokenId — legacy layout", () => {
  const fields = {
    gameId: 7n,
    mintedBy: 1234n,
    settingsId: 42n,
    startDelay: 60n,
    soulbound: true,
    hasContext: true,
    paymaster: false,
    mintedAt: 1_700_000_000n,
    endDelay: 3600n,
    objectiveId: 9n,
    txHash: 0x2ffn,
    salt: 5n,
    metadata: 0x1abcn & 0x1fffn,
  };

  it("round-trips every field", () => {
    const decoded = decodePackedTokenId(packLegacy(fields), "legacy");

    expect(decoded.generation).toBe("legacy");
    expect(decoded.gameId).toBe(7);
    expect(decoded.mintedBy).toBe(1234n);
    expect(decoded.settingsId).toBe(42);
    expect(decoded.mintedAt.getTime()).toBe(1_700_000_000 * 1000);
    expect(decoded.startDelay).toBe(60);
    expect(decoded.endDelay).toBe(3600);
    expect(decoded.objectiveId).toBe(9);
    expect(decoded.soulbound).toBe(true);
    expect(decoded.hasContext).toBe(true);
    expect(decoded.paymaster).toBe(false);
    expect(decoded.txHash).toBe(0x2ff);
    expect(decoded.salt).toBe(5);
    expect(decoded.metadata).toBe(fields.metadata);
  });

  it("defaults to legacy, so existing call sites keep their meaning", () => {
    const packed = packLegacy(fields);
    expect(decodePackedTokenId(packed)).toEqual(decodePackedTokenId(packed, "legacy"));
  });
});

describe("decodePackedTokenId — standard layout", () => {
  const fields = {
    mintedAt: 1_700_000_000n,
    startDelay: 60n,
    endDelay: 3600n,
    settingsId: 42n,
    mintedBy: 1234n,
    soulbound: true,
    txHash: 0x2ffn,
    salt: 40_000n, // needs the widened 16-bit field; would not fit legacy's 10
    paymaster: true,
    hasContext: true,
    objectiveId: 9n,
    metadata: 0n,
  };

  it("round-trips every field", () => {
    const decoded = decodePackedTokenId(packStandard(fields), "standard");

    expect(decoded.generation).toBe("standard");
    expect(decoded.mintedBy).toBe(1234n);
    expect(decoded.settingsId).toBe(42);
    expect(decoded.mintedAt.getTime()).toBe(1_700_000_000 * 1000);
    expect(decoded.startDelay).toBe(60);
    expect(decoded.endDelay).toBe(3600);
    expect(decoded.objectiveId).toBe(9);
    expect(decoded.soulbound).toBe(true);
    expect(decoded.hasContext).toBe(true);
    expect(decoded.paymaster).toBe(true);
    expect(decoded.txHash).toBe(0x2ff);
    expect(decoded.salt).toBe(40_000);
  });

  it("has no game id — the game is the contract address", () => {
    const decoded = decodePackedTokenId(packStandard(fields), "standard");
    expect(decoded.gameId).toBe(null);
  });

  it("carries metadata wider than Number.MAX_SAFE_INTEGER without losing precision", () => {
    // 65 bits. As a JS number this would round; the field is a bigint for
    // exactly this reason.
    const wide = (1n << 64n) | 12345n;
    const decoded = decodePackedTokenId(packStandard({ ...fields, metadata: wide }), "standard");

    expect(decoded.metadata).toBe(wide);
    expect(decoded.metadata > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("accepts the full 16-bit salt range that legacy could not hold", () => {
    const decoded = decodePackedTokenId(packStandard({ ...fields, salt: 0xffffn }), "standard");
    expect(decoded.salt).toBe(0xffff);
  });
});

describe("the generations are not interchangeable", () => {
  /**
   * This is the regression this whole change exists for. It asserts the
   * FAILURE mode, not the success one: reading a standard id with the legacy
   * layout must be visibly wrong, so nobody is tempted to skip passing the
   * generation through.
   */
  it("decoding a standard id as legacy yields wrong values, not an error", () => {
    const packed = packStandard({
      mintedAt: 1_700_000_000n,
      startDelay: 0n,
      endDelay: 0n,
      settingsId: 42n,
      mintedBy: 1234n,
      soulbound: false,
      txHash: 0n,
      salt: 0n,
      paymaster: false,
      hasContext: false,
      objectiveId: 0n,
      metadata: 0n,
    });

    const asStandard = decodePackedTokenId(packed, "standard");
    const asLegacy = decodePackedTokenId(packed, "legacy");

    // No throw — that is the hazard.
    expect(asStandard.mintedAt.getTime()).toBe(1_700_000_000 * 1000);
    expect(asLegacy.mintedAt.getTime()).not.toBe(asStandard.mintedAt.getTime());
    expect(asLegacy.settingsId).not.toBe(asStandard.settingsId);
  });
});
