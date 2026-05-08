/**
 * Start the indexer with retry logic for transient gRPC errors.
 *
 * Connection drops (gRPC UNAVAILABLE / DEADLINE_EXCEEDED / INTERNAL /
 * RESOURCE_EXHAUSTED) retry indefinitely with exponential backoff capped
 * at MAX_DELAY_MS — the indexer is a long-running service and transient
 * network failures are expected. If the indexer runs for STABLE_RUN_MS
 * before failing, the backoff resets.
 *
 * Non-retryable errors (assertion failures, schema mismatches, programmer
 * errors) exit immediately so the operator notices.
 *
 * Container-level restartPolicyType=ALWAYS in railway.toml is the backstop
 * for any error class that bypasses this script.
 */

import { spawn } from "node:child_process";

const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;
const STABLE_RUN_MS = 5 * 60_000; // 5 minutes = "was running fine, reset backoff"

const RETRYABLE_ERRORS = [
  "UNAVAILABLE",            // gRPC connection dropped
  "Connection dropped",     // gRPC connection dropped (message variant)
  "DEADLINE_EXCEEDED",      // gRPC timeout
  "INTERNAL",               // transient gRPC server error
  "RESOURCE_EXHAUSTED",     // gRPC rate limiting / overload
];

interface IndexerResult {
  code: number;
  elapsed: number;
}

function startIndexer(): Promise<IndexerResult> {
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
      // Cap buffer to avoid unbounded memory growth on long runs
      if (stderrBuffer.length > 100_000) {
        stderrBuffer = stderrBuffer.slice(-50_000);
      }
      process.stderr.write(data);
    });

    child.on("close", (code) => {
      const elapsed = Date.now() - startTime;

      if (code === 0) {
        process.exit(0);
      }

      const isRetryable = RETRYABLE_ERRORS.some((err) =>
        stderrBuffer.includes(err)
      );

      if (isRetryable) {
        resolve({ code: code ?? 1, elapsed });
      } else {
        // Non-retryable error — exit immediately
        console.error(`[start] Non-retryable error (exit ${code ?? 1}), shutting down.`);
        process.exit(code ?? 1);
      }
    });
  });
}

async function main(): Promise<void> {
  let consecutiveFailures = 0;

  while (true) {
    console.log(
      `[start] Starting indexer (consecutive failures: ${consecutiveFailures})...`
    );
    const result = await startIndexer();

    // If the indexer ran for a while before failing, reset backoff —
    // it was working fine, this is a fresh transient error.
    if (result.elapsed >= STABLE_RUN_MS) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
    }

    const delay = Math.min(INITIAL_DELAY_MS * 2 ** consecutiveFailures, MAX_DELAY_MS);
    console.log(
      `[start] Retryable failure (exit ${result.code}, ran ${Math.round(result.elapsed / 1000)}s), ` +
      `restarting in ${Math.round(delay / 1000)}s...`
    );
    await new Promise((r) => setTimeout(r, delay));
  }
}

main();
