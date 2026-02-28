/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_NETWORK: string;

  readonly VITE_MAINNET_RPC_URL: string;
  readonly VITE_MAINNET_API_URL: string;
  readonly VITE_MAINNET_WS_URL: string;

  readonly VITE_SEPOLIA_RPC_URL: string;
  readonly VITE_SEPOLIA_API_URL: string;
  readonly VITE_SEPOLIA_WS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
