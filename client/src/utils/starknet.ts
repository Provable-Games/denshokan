/**
 * Starknet utility functions for felt252, BigInt, and shortString conversions
 */

/**
 * Convert a felt252 (BigInt) to a short string
 */
export function feltToShortString(felt: bigint | string): string {
  const hex = BigInt(felt).toString(16);
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.slice(i, i + 2), 16);
    if (charCode > 0) str += String.fromCharCode(charCode);
  }
  return str;
}

/**
 * Convert a short string to felt252
 */
export function shortStringToFelt(str: string): bigint {
  let hex = "0x";
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return BigInt(hex);
}

/**
 * Format a Starknet address to a shortened display form
 */
export function formatAddress(address: string, chars = 6): string {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-4)}`;
}

/**
 * Normalize a Starknet address (lowercase, 0x prefix, pad to 66 chars)
 */
export function normalizeAddress(address: string): string {
  const hex = address.toLowerCase().replace("0x", "");
  return "0x" + hex.padStart(64, "0");
}

/**
 * Convert BigInt to human-readable score
 */
export function formatScore(score: bigint | string | number): string {
  return Number(score).toLocaleString();
}
