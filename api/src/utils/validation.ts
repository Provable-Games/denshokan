/**
 * Input validation helpers for API request parameters
 */

export function parseTokenId(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const id = BigInt(value);
    if (id < 0n) return null;
    return id.toString();
  } catch {
    return null;
  }
}

export function parseGameId(value: string | undefined): number | null {
  if (!value) return null;
  const id = parseInt(value, 10);
  if (isNaN(id) || id < 0) return null;
  return id;
}

export function parseAddress(value: string | undefined): string | null {
  if (!value) return null;
  // Starknet addresses are hex strings
  if (!/^0x[0-9a-fA-F]+$/.test(value)) return null;
  // Normalize to unpadded lowercase hex to match indexer storage format
  return `0x${BigInt(value).toString(16)}`;
}

export function parseNonNegativeInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 0) return defaultValue;
  return num;
}

export function parseOptionalNonNegativeInt(value: string | undefined): number | null {
  if (!value) return null;
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 0) return null;
  return num;
}
