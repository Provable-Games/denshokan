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
  numberGuessAddress: string;
  ticTacToeAddress: string;
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
      "https://denshokan-api-production-a145.up.railway.app",
    wsUrl: import.meta.env.VITE_MAINNET_WS_URL || "",
    explorerUrl: "https://voyager.online",
    denshokanAddress: "0x00c40d0eb2af0d67dac903dfd7c623cba47405f72261727778155a98f93cb4fa",
    registryAddress: "0x06e4116f7f71f929b51b99dc8bc26bf7cae8a139691e21bc27fb881e93d5bd29",
    viewerAddress: "0x074da3c0325537366a4458fe0aa4c283460914775725eb2c6c267ee3c425a0d8",
    numberGuessAddress: "",
    ticTacToeAddress: "",
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
      "https://denshokan-api-production.up.railway.app",
    wsUrl: import.meta.env.VITE_SEPOLIA_WS_URL || "",
    explorerUrl: "https://sepolia.voyager.online",
    denshokanAddress: "0x04c5c1c662dabf2698052b8a1413420d4dd7b74ef373c33015feb50cffa46fdb",
    registryAddress: "0x00901bfe1da0d447c4f3b81dfc19505f4796bc1968794de1ce8e0e6ee9fb086b",
    viewerAddress: "0x030ee3ee602255c135ec92e21d1b9eac279b850063e06e4a6a8df1d13495e53d",
    numberGuessAddress: "0x03bd957e4f01d940d571701394b1d92995fb9c4c852712edeb1608f0d91951b1",
    ticTacToeAddress: "0x03e2b0ec812689075808fa18a76d5d193f5fa13b223fbcc9005c889d7dd190f7",
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
