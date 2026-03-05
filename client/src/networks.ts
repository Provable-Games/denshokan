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
    denshokanAddress: "0x048d55f031928a769248d99b32e3c02456a953728789396be348d4815deb5c86",
    registryAddress: "0x03bd94c3c2938d8b605e0432e024aa22853327dc052f54b45ec4bd86dd779b8c",
    viewerAddress: "0x0755744181d6e329b56c3fffa927823ff865411724ddd8d1bde4888860260a93",
    numberGuessApiUrl: import.meta.env.VITE_SEPOLIA_NUMBER_GUESS_API_URL || "",
    numberGuessWsUrl: import.meta.env.VITE_SEPOLIA_NUMBER_GUESS_WS_URL || "",
    gameContracts: [
      {
        address: "0x00279b5c380763406f32c4a51d6553b84da30ff7bbe786f8d9d16306c4cdaecb",
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
