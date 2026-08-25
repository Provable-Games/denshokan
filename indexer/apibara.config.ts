import { defineConfig } from "apibara/config";

export default defineConfig({
  runtimeConfig: {
    denshokan: {
      // Starknet DNA stream URL (mainnet or sepolia)
      streamUrl: (process.env.STREAM_URL ?? "https://mainnet.starknet.a5a.ch").trim(),
      // Starting block - set to the earliest game's deployment block for full
      // history, or a recent block for a faster initial sync.
      startingBlock: (process.env.STARTING_BLOCK ?? "0").trim(),
      // PostgreSQL connection string
      databaseUrl: (process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/denshokan").trim(),
      // Game contracts to index, comma-separated.
      //
      // Every game IS its own ERC721, so this is the entire subscription: there
      // is no shared token contract and no registry to discover games through.
      // Required — an empty list would subscribe to nothing, so the indexer
      // refuses to start rather than silently indexing no data.
      //
      // An address must be listed BEFORE the game's first mint. The indexer
      // resumes from a persisted cursor, so adding an address later widens the
      // filter from that point forward only and silently skips the game's
      // earlier history.
      gameAddresses: (process.env.GAME_ADDRESSES ?? "")
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a.length > 0 && a !== "0x0"),
      // NOTE: token_uri fetching (the only RPC use) runs in the standalone
      // scripts/fetch-token-uris.ts process, which reads RPC_URL / RPC_API_KEY
      // straight from the environment. The indexer itself makes zero RPC calls,
      // so no rpcUrl/rpcApiKey belongs in this runtime config.
    },
  },
});
