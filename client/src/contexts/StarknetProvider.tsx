import { ReactNode, useMemo } from "react";
import { sepolia, mainnet } from "@starknet-react/chains";
import {
  StarknetConfig,
  jsonRpcProvider,
  voyager,
} from "@starknet-react/core";
import ControllerConnector from "@cartridge/connector/controller";
import { config, networkName } from "../config";

const chain = networkName === "sepolia" ? sepolia : mainnet;

// Chain IDs as felt252 hex strings
const CHAIN_IDS = {
  sepolia: "0x534e5f5345504f4c4941", // "SN_SEPOLIA" as felt
  mainnet: "0x534e5f4d41494e", // "SN_MAIN" as felt
} as const;

const cartridgeConnector =
  typeof window !== "undefined"
    ? new ControllerConnector({
        chains: [{ rpcUrl: config.rpcUrl }],
        defaultChainId: CHAIN_IDS[networkName === "sepolia" ? "sepolia" : "mainnet"],
        policies: {
          contracts: {
            [config.denshokanAddress]: {
              methods: [
                { name: "update_player_name", entrypoint: "update_player_name" },
                { name: "update_game", entrypoint: "update_game" },
                { name: "mint", entrypoint: "mint" },
              ],
            },
          },
        },
      })
    : null;

export function StarknetProvider({ children }: { children: ReactNode }) {
  const connectors = useMemo(() => {
    const base: any[] = [];
    if (cartridgeConnector) {
      base.push(cartridgeConnector);
    }
    return base;
  }, []);

  const rpc = useMemo(
    () => () => ({ nodeUrl: config.rpcUrl }),
    [],
  );

  return (
    <StarknetConfig
      chains={[chain]}
      provider={jsonRpcProvider({ rpc })}
      connectors={connectors}
      explorer={voyager}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
