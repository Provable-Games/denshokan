import { ReactNode, useMemo } from "react";
import {
  StarknetConfig,
  jsonRpcProvider,
  voyager,
  InjectedConnector,
} from "@starknet-react/core";
import ControllerConnector from "@cartridge/connector/controller";
import {
  getDefaultChainId,
  getNetworkConfig,
  getAllChains,
  CHAIN_ID_FELTS,
  type GameContractConfig,
} from "../networks";

const defaultChainId = getDefaultChainId();
const mainnetConfig = getNetworkConfig("SN_MAIN");
const sepoliaConfig = getNetworkConfig("SN_SEPOLIA");
const chains = getAllChains();

const orderedChains =
  defaultChainId === "SN_SEPOLIA"
    ? ([chains[1], chains[0]] as const)
    : ([chains[0], chains[1]] as const);

/** Build Controller session policies from network configs */
function buildGameContractPolicies(
  configs: GameContractConfig[],
): Record<string, { methods: { name: string; entrypoint: string }[] }> {
  const result: Record<string, { methods: { name: string; entrypoint: string }[] }> = {};
  for (const gc of configs) {
    result[gc.address] = { methods: gc.methods };
  }
  return result;
}

const denshokanMethods = [
  { name: "update_player_name", entrypoint: "update_player_name" },
  { name: "update_game", entrypoint: "update_game" },
  { name: "mint", entrypoint: "mint" },
];

const cartridgeConnector =
  typeof window !== "undefined"
    ? new ControllerConnector({
        chains: [
          { rpcUrl: mainnetConfig.rpcUrl },
          { rpcUrl: sepoliaConfig.rpcUrl },
        ],
        defaultChainId: CHAIN_ID_FELTS[defaultChainId],
        policies: {
          contracts: {
            [mainnetConfig.denshokanAddress]: { methods: denshokanMethods },
            [sepoliaConfig.denshokanAddress]: { methods: denshokanMethods },
            ...buildGameContractPolicies(mainnetConfig.gameContracts),
            ...buildGameContractPolicies(sepoliaConfig.gameContracts),
          },
        },
      })
    : null;

const argentConnector = new InjectedConnector({
  options: { id: "argentX", name: "Argent X" },
});

const braavosConnector = new InjectedConnector({
  options: { id: "braavos", name: "Braavos" },
});

const rpcByChainId: Record<string, string> = {
  [String(chains[0].id)]: mainnetConfig.rpcUrl,
  [String(chains[1].id)]: sepoliaConfig.rpcUrl,
};

export function StarknetProvider({ children }: { children: ReactNode }) {
  const connectors = useMemo(() => {
    const base: any[] = [];
    if (cartridgeConnector) {
      base.push(cartridgeConnector);
    }
    base.push(argentConnector, braavosConnector);
    return base;
  }, []);

  const rpc = useMemo(
    () => (chain: { id: bigint }) => ({
      nodeUrl: rpcByChainId[String(chain.id)] || mainnetConfig.rpcUrl,
    }),
    [],
  );

  return (
    <StarknetConfig
      chains={[...orderedChains]}
      provider={jsonRpcProvider({ rpc })}
      connectors={connectors}
      explorer={voyager}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
