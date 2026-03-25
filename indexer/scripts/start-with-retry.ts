/**
 * Start the indexer with retry logic for trigger conflicts.
 *
 * During rolling deploys the old instance may still hold reorg triggers when
 * the new instance starts.  The sequence:
 *   1. Run db:cleanup (drop stale triggers)
 *   2. Run `apibara start`
 *   3. If it fails with "already exists" within the first few seconds,
 *      re-run cleanup and retry (up to MAX_RETRIES times with backoff).
 */

import { execSync, spawn } from "node:child_process";

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 3_000;
const EARLY_FAILURE_WINDOW_MS = 30_000; // treat crash within 30s as trigger-related

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
      const elapsed = Date.now() - startTime;
      // Only retry if it crashed quickly and the error is trigger-related
      if (
        code !== 0 &&
        elapsed < EARLY_FAILURE_WINDOW_MS &&
        stderrBuffer.includes("already exists")
      ) {
        resolve(code ?? 1);
      } else {
        // Either succeeded, or failed for a non-trigger reason, or ran long enough
        // that retrying won't help — propagate the exit code directly.
        process.exit(code ?? 0);
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
      const delay = INITIAL_DELAY_MS * attempt;
      console.log(
        `[start] Trigger conflict detected (exit ${code}), retrying in ${delay / 1000}s...`
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
