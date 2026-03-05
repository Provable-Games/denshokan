const LOOKUP_URL = "https://api.cartridge.gg/accounts/lookup";
const BATCH_DELAY = 50;

interface LookupResult {
  username: string;
  addresses: string[];
}

const cache = new Map<string, string | null>();
const pending = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let flushPromise: Promise<void> | null = null;

function normalizeAddress(address: string): string {
  const hex = address.toLowerCase().replace("0x", "");
  return "0x" + hex.padStart(64, "0");
}

async function flush() {
  const addresses = Array.from(pending);
  pending.clear();
  if (addresses.length === 0) return;

  try {
    const res = await fetch(LOOKUP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses }),
    });
    if (!res.ok) return;

    const json: { results: LookupResult[] } = await res.json();
    if (json.results) {
      for (const r of json.results) {
        for (const addr of r.addresses) {
          cache.set(normalizeAddress(addr), r.username);
        }
      }
    }
    // Mark addresses with no result as null
    for (const addr of addresses) {
      const key = normalizeAddress(addr);
      if (!cache.has(key)) {
        cache.set(key, null);
      }
    }
  } catch {
    // Silently fail
  }
}

/**
 * Get cached username for an address (sync, returns null if not cached).
 */
export function getCachedUsername(address: string): string | null {
  return cache.get(normalizeAddress(address)) ?? null;
}

/**
 * Resolve a username for an address, fetching if needed.
 * Batches concurrent calls within a 50ms window.
 */
export async function resolveUsername(address: string): Promise<string | null> {
  const key = normalizeAddress(address);
  if (cache.has(key)) return cache.get(key) ?? null;

  pending.add(address);

  if (batchTimer) clearTimeout(batchTimer);

  flushPromise = new Promise<void>((resolve) => {
    batchTimer = setTimeout(async () => {
      await flush();
      resolve();
      flushPromise = null;
    }, BATCH_DELAY);
  });

  await flushPromise;
  return cache.get(key) ?? null;
}

/**
 * Get display name: username if available, else truncated address.
 * Async — waits for lookup if not cached.
 */
export async function getDisplayName(address: string): Promise<string> {
  if (!address) return "";
  const username = await resolveUsername(address);
  if (username) return username;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
