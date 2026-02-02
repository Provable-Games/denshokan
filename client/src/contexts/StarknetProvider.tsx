import { ReactNode } from "react";
import { sepolia, mainnet } from "@starknet-react/chains";
import { StarknetConfig, voyager } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { RpcProvider } from "starknet";
import { config, networkName } from "../config";

const cartridgeConnector = new ControllerConnector({
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
  rpcUrl: config.rpcUrl,
}) as any;

function provider() {
  return new RpcProvider({ nodeUrl: config.rpcUrl });
}

const chain = networkName === "sepolia" ? sepolia : mainnet;

export function StarknetProvider({ children }: { children: ReactNode }) {
  return (
    <StarknetConfig
      chains={[chain]}
      provider={provider}
      connectors={[cartridgeConnector]}
      explorer={voyager}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
