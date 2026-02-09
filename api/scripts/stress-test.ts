/**
 * API stress test script for the Denshokan API.
 *
 * Usage: npx tsx scripts/stress-test.ts --url http://localhost:3001 [--concurrency 50] [--requests 100] [--output results.txt]
 *
 * Runs concurrent requests against all API endpoints and reports per-endpoint
 * latency percentiles (p50/p95/p99), error rates, and throughput.
 */

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name: string, defaultVal: string): string {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const BASE_URL = getArg("--url", "http://localhost:3001").replace(/\/$/, "");
const CONCURRENCY = parseInt(getArg("--concurrency", "50"), 10);
const REQUESTS_PER_ENDPOINT = parseInt(getArg("--requests", "100"), 10);
const OUTPUT_FILE = getArg("--output", "");

// ---------------------------------------------------------------------------
// Semaphore for concurrency control
// ---------------------------------------------------------------------------

class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RequestResult {
  status: number;
  latencyMs: number;
  error?: string;
}

async function fetchEndpoint(url: string): Promise<RequestResult> {
  const start = performance.now();
  try {
    const res = await fetch(url);
    const latencyMs = performance.now() - start;
    // Consume body to fully complete the request
    await res.text();
    return { status: res.status, latencyMs };
  } catch (err: any) {
    return { status: 0, latencyMs: performance.now() - start, error: err.message };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Discovery: fetch valid IDs from the API
// ---------------------------------------------------------------------------

interface DiscoveredData {
  tokenIds: string[];
  gameIds: number[];
  ownerAddresses: string[];
  minterIds: string[];
  eventTypes: string[];
}

async function discover(): Promise<DiscoveredData> {
  const data: DiscoveredData = {
    tokenIds: [],
    gameIds: [],
    ownerAddresses: [],
    minterIds: [],
    eventTypes: ["Transfer", "ScoreUpdate", "GameOver"],
  };

  // Fetch tokens
  try {
    const res = await fetch(`${BASE_URL}/tokens?limit=50`);
    if (res.ok) {
      const json = await res.json() as any;
      for (const t of json.data ?? []) {
        data.tokenIds.push(t.tokenId);
        if (t.ownerAddress && !data.ownerAddresses.includes(t.ownerAddress)) {
          data.ownerAddresses.push(t.ownerAddress);
        }
      }
    }
  } catch { /* ignore */ }

  // Fetch games
  try {
    const res = await fetch(`${BASE_URL}/games?limit=50`);
    if (res.ok) {
      const json = await res.json() as any;
      for (const g of json.data ?? []) {
        data.gameIds.push(g.gameId);
      }
    }
  } catch { /* ignore */ }

  // Fetch minters
  try {
    const res = await fetch(`${BASE_URL}/minters?limit=50`);
    if (res.ok) {
      const json = await res.json() as any;
      for (const m of json.data ?? []) {
        data.minterIds.push(m.minterId);
      }
    }
  } catch { /* ignore */ }

  // Fallbacks
  if (data.tokenIds.length === 0) data.tokenIds.push("1");
  if (data.gameIds.length === 0) data.gameIds.push(1);
  if (data.ownerAddresses.length === 0) data.ownerAddresses.push("0x0");
  if (data.minterIds.length === 0) data.minterIds.push("1");

  return data;
}

// ---------------------------------------------------------------------------
// Endpoint definitions
// ---------------------------------------------------------------------------

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface EndpointDef {
  name: string;
  url: (d: DiscoveredData) => string;
}

function buildEndpoints(): EndpointDef[] {
  return [
    { name: "GET /tokens", url: () => `${BASE_URL}/tokens` },
    { name: "GET /tokens?game_id", url: (d) => `${BASE_URL}/tokens?game_id=${randomPick(d.gameIds)}` },
    { name: "GET /tokens?owner", url: (d) => `${BASE_URL}/tokens?owner=${randomPick(d.ownerAddresses)}` },
    { name: "GET /tokens?game_over", url: () => `${BASE_URL}/tokens?game_over=true` },
    { name: "GET /tokens/:id", url: (d) => `${BASE_URL}/tokens/${randomPick(d.tokenIds)}` },
    { name: "GET /tokens/:id/scores", url: (d) => `${BASE_URL}/tokens/${randomPick(d.tokenIds)}/scores` },
    { name: "GET /games", url: () => `${BASE_URL}/games` },
    { name: "GET /games/:id", url: (d) => `${BASE_URL}/games/${randomPick(d.gameIds)}` },
    { name: "GET /games/:id/stats", url: (d) => `${BASE_URL}/games/${randomPick(d.gameIds)}/stats` },
    { name: "GET /players/:addr/tokens", url: (d) => `${BASE_URL}/players/${randomPick(d.ownerAddresses)}/tokens` },
    { name: "GET /players/:addr/stats", url: (d) => `${BASE_URL}/players/${randomPick(d.ownerAddresses)}/stats` },
    { name: "GET /activity", url: () => `${BASE_URL}/activity` },
    { name: "GET /activity?type", url: (d) => `${BASE_URL}/activity?type=${randomPick(d.eventTypes)}` },
    { name: "GET /activity/stats", url: () => `${BASE_URL}/activity/stats` },
    { name: "GET /minters", url: () => `${BASE_URL}/minters` },
    { name: "GET /minters/:id", url: (d) => `${BASE_URL}/minters/${randomPick(d.minterIds)}` },
  ];
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface EndpointReport {
  name: string;
  requests: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  reqPerSec: number;
}

async function runEndpoint(
  def: EndpointDef,
  data: DiscoveredData,
  semaphore: Semaphore,
): Promise<EndpointReport> {
  const results: RequestResult[] = [];
  const t0 = performance.now();

  const promises = Array.from({ length: REQUESTS_PER_ENDPOINT }, async () => {
    await semaphore.acquire();
    try {
      const result = await fetchEndpoint(def.url(data));
      results.push(result);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(promises);
  const elapsed = (performance.now() - t0) / 1000;

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const errors = results.filter((r) => r.status === 0 || r.status >= 500).length;

  return {
    name: def.name,
    requests: results.length,
    errors,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    reqPerSec: results.length / elapsed,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function formatReport(reports: EndpointReport[]): string {
  const lines: string[] = [];

  // Column widths
  const nameW = Math.max(25, ...reports.map((r) => r.name.length));
  const numW = 8;

  const pad = (s: string, w: number) => s.padEnd(w);
  const padN = (n: number, w: number, d = 1) => n.toFixed(d).padStart(w);

  const header = [
    pad("Endpoint", nameW),
    "Reqs".padStart(numW),
    "Errs".padStart(numW),
    "p50ms".padStart(numW),
    "p95ms".padStart(numW),
    "p99ms".padStart(numW),
    "req/s".padStart(numW),
  ].join("  ");

  const sep = "-".repeat(header.length);

  lines.push(sep, header, sep);

  for (const r of reports) {
    lines.push(
      [
        pad(r.name, nameW),
        padN(r.requests, numW, 0),
        padN(r.errors, numW, 0),
        padN(r.p50, numW),
        padN(r.p95, numW),
        padN(r.p99, numW),
        padN(r.reqPerSec, numW),
      ].join("  "),
    );
  }

  lines.push(sep);

  const totalReqs = reports.reduce((s, r) => s + r.requests, 0);
  const totalErrs = reports.reduce((s, r) => s + r.errors, 0);
  lines.push(
    "",
    `Total: ${totalReqs} requests, ${totalErrs} errors (${((totalErrs / totalReqs) * 100).toFixed(1)}% error rate)`,
    "Note: 429 (rate limited) responses are NOT counted as errors; only 5xx and network failures are.",
    "",
  );

  return lines.join("\n");
}

async function printReport(reports: EndpointReport[]) {
  const report = formatReport(reports);
  console.log("\n" + report);

  if (OUTPUT_FILE) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(OUTPUT_FILE, report, "utf-8");
    console.log(`Results written to ${OUTPUT_FILE}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Stress test: ${BASE_URL}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Requests per endpoint: ${REQUESTS_PER_ENDPOINT}`);

  console.log("\nDiscovering test data...");
  const data = await discover();
  console.log(
    `  Found: ${data.tokenIds.length} tokens, ${data.gameIds.length} games, ` +
    `${data.ownerAddresses.length} owners, ${data.minterIds.length} minters`,
  );

  const endpoints = buildEndpoints();
  const semaphore = new Semaphore(CONCURRENCY);
  const reports: EndpointReport[] = [];

  console.log(`\nRunning ${endpoints.length} endpoints x ${REQUESTS_PER_ENDPOINT} requests...`);

  for (const ep of endpoints) {
    process.stdout.write(`  ${ep.name}...`);
    const report = await runEndpoint(ep, data, semaphore);
    reports.push(report);
    process.stdout.write(` p50=${report.p50.toFixed(1)}ms p99=${report.p99.toFixed(1)}ms\n`);
  }

  await printReport(reports);
}

main().catch((err) => {
  console.error("Stress test failed:", err);
  process.exit(1);
});
