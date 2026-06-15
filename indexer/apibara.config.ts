import { defineConfig } from "apibara/config";

export default defineConfig({
  runtimeConfig: {
    denshokan: {
      // Denshokan token contract address
      contractAddress: (process.env.DENSHOKAN_ADDRESS ?? "0x0").trim(),
      // Minigame registry contract address
      registryAddress: (process.env.REGISTRY_ADDRESS ?? "0x0").trim(),
      // Starknet DNA stream URL (mainnet or sepolia)
      streamUrl: (process.env.STREAM_URL ?? "https://mainnet.starknet.a5a.ch").trim(),
      // Starting block - set to contract deployment block for full history
      // or use a recent block for faster initial sync
      startingBlock: (process.env.STARTING_BLOCK ?? "0").trim(),
      // PostgreSQL connection string
      databaseUrl: (process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/denshokan").trim(),
      // NOTE: token_uri fetching (the only RPC use) runs in the standalone
      // scripts/fetch-token-uris.ts process, which reads RPC_URL / RPC_API_KEY
      // straight from the environment. The indexer itself makes zero RPC calls,
      // so no rpcUrl/rpcApiKey belongs in this runtime config.
    },
  },
});
