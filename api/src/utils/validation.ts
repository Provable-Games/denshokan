/**
 * Input validation helpers for API request parameters
 */

export function parseTokenId(value: string | undefined): bigint | null {
  if (!value) return null;
  try {
    const id = BigInt(value);
    if (id < 0n) return null;
    return id;
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
  return value.toLowerCase();
}

export function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 1) return defaultValue;
  return num;
}

export function parsePeriod(value: string | undefined): { start: Date; end: Date } | null {
  if (!value) return null;

  const now = new Date();
  switch (value) {
    case "1h":
      return { start: new Date(now.getTime() - 3600_000), end: now };
    case "24h":
      return { start: new Date(now.getTime() - 86400_000), end: now };
    case "7d":
      return { start: new Date(now.getTime() - 7 * 86400_000), end: now };
    case "30d":
      return { start: new Date(now.getTime() - 30 * 86400_000), end: now };
    default:
      return null;
  }
}
