const NETWORK = import.meta.env.VITE_NETWORK || "mainnet";

interface NetworkConfig {
  chainId: string;
  rpcUrl: string;
  apiUrl: string;
  explorerUrl: string;
  denshokanAddress: string;
  registryAddress: string;
  viewerAddress: string;
}

const configs: Record<string, NetworkConfig> = {
  mainnet: {
    chainId: "SN_MAIN",
    rpcUrl:
      import.meta.env.VITE_RPC_URL ||
      "https://api.cartridge.gg/x/starknet/mainnet",
    apiUrl: import.meta.env.VITE_API_URL || "https://localhost:3001",
    explorerUrl: "https://voyager.online",
    denshokanAddress: import.meta.env.VITE_DENSHOKAN_ADDRESS || "",
    registryAddress: import.meta.env.VITE_REGISTRY_ADDRESS || "",
    viewerAddress: import.meta.env.VITE_VIEWER_ADDRESS || "",
  },
  sepolia: {
    chainId: "SN_SEPOLIA",
    rpcUrl:
      import.meta.env.VITE_RPC_URL ||
      "https://api.cartridge.gg/x/starknet/sepolia",
    apiUrl: import.meta.env.VITE_API_URL || "https://localhost:3001",
    explorerUrl: "https://sepolia.voyager.online",
    denshokanAddress: import.meta.env.VITE_DENSHOKAN_ADDRESS || "",
    registryAddress: import.meta.env.VITE_REGISTRY_ADDRESS || "",
    viewerAddress: import.meta.env.VITE_VIEWER_ADDRESS || "",
  },
};

export const config = configs[NETWORK] || configs.mainnet;
export const networkName = NETWORK;
