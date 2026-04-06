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
      // Starknet RPC URL for token_uri fetches
      rpcUrl: (process.env.RPC_URL ?? "https://api.cartridge.gg/x/starknet/mainnet").trim(),
      // Cartridge RPC API key (Bearer token for Authorization header)
      rpcApiKey: (process.env.RPC_API_KEY ?? "").trim(),
    },
  },
});
