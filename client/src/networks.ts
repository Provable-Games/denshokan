import { type Chain, mainnet, sepolia } from "@starknet-react/chains";

export type ChainId = "SN_MAIN" | "SN_SEPOLIA";

export interface DenshokanChainConfig {
  chainId: ChainId;
  chain: Chain;
  networkName: "mainnet" | "sepolia";
  rpcUrl: string;
  apiUrl: string;
  wsUrl: string;
  explorerUrl: string;
  denshokanAddress: string;
  registryAddress: string;
  viewerAddress: string;
  numberGuessApiUrl: string;
  numberGuessWsUrl: string;
}

export const CHAIN_ID_FELTS: Record<ChainId, string> = {
  SN_MAIN: "0x534e5f4d41494e",
  SN_SEPOLIA: "0x534e5f5345504f4c4941",
};

const NETWORKS: Record<ChainId, DenshokanChainConfig> = {
  SN_MAIN: {
    chainId: "SN_MAIN",
    chain: mainnet,
    networkName: "mainnet",
    rpcUrl:
      import.meta.env.VITE_MAINNET_RPC_URL ||
      "https://api.cartridge.gg/x/starknet/mainnet",
    apiUrl:
      import.meta.env.VITE_MAINNET_API_URL ||
      "https://denshokan-api-production.up.railway.app",
    wsUrl: import.meta.env.VITE_MAINNET_WS_URL || "",
    explorerUrl: "https://voyager.online",
    denshokanAddress: "0x03b54a422e241957e105f41e992bdd5af349d68a87358e5f470a5c2880bc6253",
    registryAddress: "0x01b529f24758f5862d4c614440aa0188a9e86d5adcfc55b39d28cd42e31daae1",
    viewerAddress: "0x011e6c8ae5550ea53fa49c6badaf17cc3732795ecb0389275183362e1078392d",
    numberGuessApiUrl: import.meta.env.VITE_MAINNET_NUMBER_GUESS_API_URL || "",
    numberGuessWsUrl: import.meta.env.VITE_MAINNET_NUMBER_GUESS_WS_URL || "",
  },
  SN_SEPOLIA: {
    chainId: "SN_SEPOLIA",
    chain: sepolia,
    networkName: "sepolia",
    rpcUrl:
      import.meta.env.VITE_SEPOLIA_RPC_URL ||
      "https://api.cartridge.gg/x/starknet/sepolia",
    apiUrl:
      import.meta.env.VITE_SEPOLIA_API_URL ||
      "https://denshokan-api-sepolia.up.railway.app",
    wsUrl: import.meta.env.VITE_SEPOLIA_WS_URL || "",
    explorerUrl: "https://sepolia.voyager.online",
    denshokanAddress: "0x024c4870f96355ac9fd701bd05ab5d08c220c371ebb861535eb9851a959c522d",
    registryAddress: "0x00fb60dd651f600e56b596d0420d6bf018a82ba27ffe9ec93ebd6e771048dc22",
    viewerAddress: "0x000d3985164bf64dfe013c82441e0e0ceca657027214901c758c5d7ef9f559db",
    numberGuessApiUrl: import.meta.env.VITE_SEPOLIA_NUMBER_GUESS_API_URL || "",
    numberGuessWsUrl: import.meta.env.VITE_SEPOLIA_NUMBER_GUESS_WS_URL || "",
  },
};

export function getDefaultChainId(): ChainId {
  const urlParams = new URLSearchParams(window.location.search);
  const urlNetwork = urlParams.get("network");
  if (urlNetwork === "sepolia") return "SN_SEPOLIA";
  if (urlNetwork === "mainnet") return "SN_MAIN";

  const envDefault = import.meta.env.VITE_DEFAULT_NETWORK;
  if (envDefault === "sepolia") return "SN_SEPOLIA";

  return "SN_MAIN";
}

export function getNetworkConfig(chainId: ChainId): DenshokanChainConfig {
  return NETWORKS[chainId];
}

export function getAllChains() {
  return [NETWORKS.SN_MAIN.chain, NETWORKS.SN_SEPOLIA.chain] as const;
}

export function getAllChainConfigs() {
  return NETWORKS;
}
