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
      // Game contracts to index, comma-separated (game-components v2.x).
      //
      // Each game IS its own token, so these are game addresses, full stop —
      // not a token contract plus a registry of games, which is what the
      // legacy denshokan above is. Empty by default: a deployment indexing
      // only the legacy denshokan needs no change and behaves as before.
      //
      // An address listed here is decoded with the `standard` token-id layout
      // (`token::packing` upstream); anything else gets `legacy`
      // (`token_legacy::structs`). Getting that wrong is SILENT — the layouts
      // share no offsets and ids carry no marker — so only list contracts you
      // have confirmed are v2.x.
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
