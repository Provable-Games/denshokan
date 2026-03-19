import { type Chain, mainnet, sepolia } from "@starknet-react/chains";

export type ChainId = "SN_MAIN" | "SN_SEPOLIA";

export interface GameContractConfig {
  address: string;
  methods: { name: string; entrypoint: string }[];
}

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
  /** Game contracts that need Controller session policies */
  gameContracts: GameContractConfig[];
}

/** Standard methods for minigame contracts */
const MINIGAME_METHODS = [
  { name: "mint_game", entrypoint: "mint_game" },
  { name: "new_game", entrypoint: "new_game" },
  { name: "guess", entrypoint: "guess" },
  { name: "make_move", entrypoint: "make_move" },
  { name: "create_settings", entrypoint: "create_settings" },
  { name: "create_objective", entrypoint: "create_objective" },
];

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
    numberGuessApiUrl: import.meta.env.VITE_MAINNET_NUMBER_GUESS_API_URL || "",
    numberGuessWsUrl: import.meta.env.VITE_MAINNET_NUMBER_GUESS_WS_URL || "",
    gameContracts: [],
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
    denshokanAddress: "0x05178014ac8150207c795a9e426cfcbb0546ba1e033e869b04e0b6d8c2791e64",
    registryAddress: "0x02d6dfa06df59948cd5b967ef9644d071525ddc5226bf21e0578d7265e22113d",
    viewerAddress: "0x0658d5f90ddeaa20ccc22cdb25bda7a42594c3745ba500999fb966bfc40f8a55",
    numberGuessApiUrl: import.meta.env.VITE_SEPOLIA_NUMBER_GUESS_API_URL || "",
    numberGuessWsUrl: import.meta.env.VITE_SEPOLIA_NUMBER_GUESS_WS_URL || "",
    gameContracts: [
      {
        address: "0x072bf4d1484599165731399c38f1c3aa27dcb31f88dac80b31098c925d7843a5",
        methods: MINIGAME_METHODS,
      },
      {
        address: "0x04484ca347cd957b9d591890ac7488ce0c0cd7920819f0c6376aedb953458a38",
        methods: MINIGAME_METHODS,
      },
    ],
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
