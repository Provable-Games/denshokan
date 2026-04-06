/**
 * Start the indexer with retry logic for trigger conflicts and transient errors.
 *
 * During rolling deploys the old instance may still hold reorg triggers when
 * the new instance starts.  The sequence:
 *   1. Run db:cleanup (drop stale triggers)
 *   2. Run `apibara start`
 *   3. If it fails with a retryable error (trigger conflict or gRPC disconnect),
 *      re-run cleanup and retry (up to MAX_RETRIES times with backoff).
 */

import { execSync, spawn } from "node:child_process";

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 3_000;
const MAX_DELAY_MS = 30_000;
const EARLY_FAILURE_WINDOW_MS = 30_000; // treat crash within 30s as trigger-related

const RETRYABLE_ERRORS = [
  "already exists",         // trigger conflict during rolling deploy
  "UNAVAILABLE",            // gRPC connection dropped
  "Connection dropped",     // gRPC connection dropped (message variant)
  "DEADLINE_EXCEEDED",      // gRPC timeout
  "INTERNAL",               // transient gRPC server error
];

function runCleanup(): void {
  console.log("[start] Running trigger cleanup...");
  execSync("npx tsx scripts/cleanup-triggers.ts", {
    stdio: "inherit",
    env: process.env,
  });
}

function startIndexer(): Promise<number> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const passthroughArgs = process.argv.slice(2);
    const child = spawn("npx", ["apibara", "start", ...passthroughArgs], {
      stdio: ["inherit", "inherit", "pipe"],
      env: process.env,
    });

    let stderrBuffer = "";

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderrBuffer += text;
      process.stderr.write(data);
    });

    child.on("close", (code) => {
      if (code === 0) {
        process.exit(0);
      }

      const isRetryable = RETRYABLE_ERRORS.some((err) =>
        stderrBuffer.includes(err)
      );

      const elapsed = Date.now() - startTime;
      // Retry trigger conflicts only if they happen early (rolling deploy).
      // Retry gRPC disconnects regardless of how long the indexer ran.
      const isTriggerConflict =
        elapsed < EARLY_FAILURE_WINDOW_MS &&
        stderrBuffer.includes("already exists");
      const isConnectionDrop = isRetryable && !stderrBuffer.includes("already exists");

      if (isTriggerConflict || isConnectionDrop) {
        resolve(code ?? 1);
      } else {
        process.exit(code ?? 1);
      }
    });
  });
}

async function main(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    runCleanup();

    console.log(
      `[start] Starting indexer (attempt ${attempt}/${MAX_RETRIES})...`
    );
    const code = await startIndexer();

    if (attempt < MAX_RETRIES) {
      const delay = Math.min(INITIAL_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
      console.log(
        `[start] Retryable failure (exit ${code}), restarting in ${delay / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, delay));
    } else {
      console.error(
        `[start] Failed after ${MAX_RETRIES} attempts, giving up.`
      );
      process.exit(code);
    }
  }
}

main();
