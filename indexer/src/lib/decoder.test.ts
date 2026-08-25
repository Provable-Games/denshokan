import { describe, expect, it } from "vitest";

import { decodePackedTokenId } from "./decoder.js";

/**
 * Token-id decoding is the one thing in this indexer that fails SILENTLY.
 *
 * An id is a felt252 with no framing: get an offset wrong by a bit and nothing
 * throws — you get a timestamp, a settings id and a minter id, all plausible
 * and all wrong, written straight into the database.
 *
 * So these tests pack the bits from the documented layout rather than
 * importing the decoder's own constants. A test that reused TOKEN_ID_OFFSETS
 * would agree with any typo those constants contained.
 *
 *     0–34  minted_at  |  35–59  start_delay  |  60–84  end_delay
 *   85–100  settings_id| 101–126 minted_by    | 127     soulbound
 *  128–137  tx_hash    | 138–153 salt         | 154     paymaster
 *  155      has_context| 156–185 objective_id | 186–250 metadata
 */
function pack(f: {
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
  return (
    f.mintedAt |
    (f.startDelay << 35n) |
    (f.endDelay << 60n) |
    (f.settingsId << 85n) |
    (f.mintedBy << 101n) |
    (BigInt(f.soulbound) << 127n) |
    (f.txHash << 128n) |
    (f.salt << 138n) |
    (BigInt(f.paymaster) << 154n) |
    (BigInt(f.hasContext) << 155n) |
    (f.objectiveId << 156n) |
    (f.metadata << 186n)
  );
}

const ZERO = {
  mintedAt: 0n,
  startDelay: 0n,
  endDelay: 0n,
  settingsId: 0n,
  mintedBy: 0n,
  soulbound: false,
  txHash: 0n,
  salt: 0n,
  paymaster: false,
  hasContext: false,
  objectiveId: 0n,
  metadata: 0n,
};

describe("decodePackedTokenId", () => {
  it("round-trips every field at once", () => {
    const packed = pack({
      mintedAt: 1_800_000_000n,
      startDelay: 3_600n,
      endDelay: 86_400n,
      settingsId: 0xbeefn, // fills all 16 bits
      mintedBy: 0x3ff_ffffn, // fills all 26 bits
      soulbound: true,
      txHash: 0x3ffn, // 10 bits
      salt: 0xffffn, // 16 bits
      paymaster: true,
      hasContext: true,
      objectiveId: 0x3fff_ffffn, // 30 bits
      metadata: 0x1_ffff_ffff_ffff_ffffn, // 65 bits
    });

    const d = decodePackedTokenId(packed);
    expect(d.mintedAt.getTime()).toBe(1_800_000_000 * 1000);
    expect(d.startDelay).toBe(3_600);
    expect(d.endDelay).toBe(86_400);
    expect(d.settingsId).toBe(0xbeef);
    expect(d.mintedBy).toBe(0x3ff_ffffn);
    expect(d.soulbound).toBe(true);
    expect(d.txHash).toBe(0x3ff);
    expect(d.salt).toBe(0xffff);
    expect(d.paymaster).toBe(true);
    expect(d.hasContext).toBe(true);
    expect(d.objectiveId).toBe(0x3fff_ffff);
    expect(d.metadata).toBe(0x1_ffff_ffff_ffff_ffffn);
  });

  it("decodes an all-zero id to zeroes", () => {
    const d = decodePackedTokenId(pack(ZERO));
    expect(d.mintedBy).toBe(0n);
    expect(d.settingsId).toBe(0);
    expect(d.objectiveId).toBe(0);
    expect(d.soulbound).toBe(false);
    expect(d.hasContext).toBe(false);
    expect(d.paymaster).toBe(false);
    expect(d.txHash).toBe(0);
    expect(d.salt).toBe(0);
    expect(d.metadata).toBe(0n);
  });

  it("keeps the three flags independent across the u128 boundary", () => {
    const soulbound = decodePackedTokenId(pack({ ...ZERO, soulbound: true }));
    expect(soulbound.soulbound).toBe(true);
    expect(soulbound.paymaster).toBe(false);
    expect(soulbound.hasContext).toBe(false);

    const paymaster = decodePackedTokenId(pack({ ...ZERO, paymaster: true }));
    expect(paymaster.paymaster).toBe(true);
    expect(paymaster.soulbound).toBe(false);
    expect(paymaster.hasContext).toBe(false);

    const hasContext = decodePackedTokenId(pack({ ...ZERO, hasContext: true }));
    expect(hasContext.hasContext).toBe(true);
    expect(hasContext.soulbound).toBe(false);
    expect(hasContext.paymaster).toBe(false);
  });

  it("does not bleed a saturated field into its neighbours", () => {
    // settings_id saturated: the 25-bit end_delay below it and the 26-bit
    // minted_by above it must both stay zero.
    const d = decodePackedTokenId(pack({ ...ZERO, settingsId: 0xffffn }));
    expect(d.settingsId).toBe(0xffff);
    expect(d.endDelay).toBe(0);
    expect(d.mintedBy).toBe(0n);
    expect(d.soulbound).toBe(false);
  });

  it("holds metadata beyond Number.MAX_SAFE_INTEGER", () => {
    // 65 bits does not fit a JS number — this is why the column and the field
    // are both arbitrary-precision.
    const metadata = 0x1_ffff_ffff_ffff_ffffn;
    expect(metadata).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    const d = decodePackedTokenId(pack({ ...ZERO, metadata }));
    expect(d.metadata).toBe(metadata);
  });

  it("accepts a hex string id", () => {
    const packed = pack({ ...ZERO, mintedAt: 1_700_000_000n });
    const d = decodePackedTokenId(`0x${packed.toString(16)}`);
    expect(d.mintedAt.getTime()).toBe(1_700_000_000 * 1000);
  });

  it("decodes a realistic mint", () => {
    const packed = pack({
      ...ZERO,
      mintedAt: 1_770_000_000n,
      settingsId: 3n,
      mintedBy: 1n,
      objectiveId: 7n,
      salt: 2n,
    });
    const d = decodePackedTokenId(packed);
    expect(d.mintedAt.getTime()).toBe(1_770_000_000 * 1000);
    expect(d.settingsId).toBe(3);
    expect(d.mintedBy).toBe(1n);
    expect(d.objectiveId).toBe(7);
    expect(d.salt).toBe(2);
    expect(d.soulbound).toBe(false);
  });
});
