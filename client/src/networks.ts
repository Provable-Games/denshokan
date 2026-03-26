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
      "https://denshokan-api-production.up.railway.app",
    wsUrl: import.meta.env.VITE_MAINNET_WS_URL || "",
    explorerUrl: "https://voyager.online",
    denshokanAddress: "0x04a8ca498b599a626756545c657f918905eb877f331801a02067d280d0312888",
    registryAddress: "0x03a7585714a5c2be8fd4333ff2ce7ef2a00d344fd319aa625693cf9af4449d9c",
    viewerAddress: "0x079d33700028250eb89ad937fc3b633818e22fac3b6f5f6388448ea256737ac7",
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
      "https://denshokan-api-sepolia.up.railway.app",
    wsUrl: import.meta.env.VITE_SEPOLIA_WS_URL || "",
    explorerUrl: "https://sepolia.voyager.online",
    denshokanAddress: "0x017eae504f5716423d423c3fe5640b4dcf830a9634c243d86f6fe0cc01b688c3",
    registryAddress: "0x04e2b728f2b0209ede6f3fd01ec190c33d1d73aa628ad5e9f80549ba62d0e331",
    viewerAddress: "0x036d3cab94a44a63ecd063d1c26e1f37915c75a2e0ae419e2f8f56421c2278b6",
    numberGuessApiUrl: import.meta.env.VITE_SEPOLIA_NUMBER_GUESS_API_URL || "",
    numberGuessWsUrl: import.meta.env.VITE_SEPOLIA_NUMBER_GUESS_WS_URL || "",
    gameContracts: [
      {
        address: "0x03ff67edcaa997b7c9b44c659a2eb313a13e576519f5306f26316211c184de73",
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
