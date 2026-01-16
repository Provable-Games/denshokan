/**
 * DNA Server Health Check Script
 *
 * Verifies that the Apibara DNA stream server is accessible and responding.
 * Run this before starting the indexer to ensure connectivity.
 *
 * Usage:
 *   npx tsx scripts/check-dna-status.ts
 *   npm run check-dna
 */

const DEFAULT_STREAM_URL = "https://mainnet.starknet.a5a.ch";

async function checkDnaStatus(): Promise<void> {
  const streamUrl = process.env.STREAM_URL ?? DEFAULT_STREAM_URL;
  console.log(`Checking DNA server status: ${streamUrl}`);

  try {
    // Try to connect to the health endpoint
    // Apibara DNA servers typically respond to basic HTTP requests
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(streamUrl, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    console.log(`Response status: ${response.status}`);
    console.log(`Server is reachable.`);

    // For gRPC-based servers, a 405 Method Not Allowed is normal
    // since they expect gRPC protocol, not HTTP GET
    if (response.status === 405 || response.status === 200 || response.status === 426) {
      console.log("DNA server appears to be running (gRPC endpoint).");
      process.exit(0);
    }

    console.warn(`Unexpected status code: ${response.status}`);
    process.exit(1);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.error("Connection timed out after 10 seconds.");
      } else {
        console.error(`Connection error: ${error.message}`);
      }
    } else {
      console.error("Unknown error:", error);
    }
    process.exit(1);
  }
}

checkDnaStatus();
