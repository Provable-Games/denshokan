/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK: string;
  readonly VITE_RPC_URL: string;
  readonly VITE_API_URL: string;
  readonly VITE_DENSHOKAN_ADDRESS: string;
  readonly VITE_REGISTRY_ADDRESS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
