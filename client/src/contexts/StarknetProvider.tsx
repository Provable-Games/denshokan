import { ReactNode } from "react";
import { sepolia, mainnet, type Chain } from "@starknet-react/chains";
import { StarknetConfig, jsonRpcProvider, voyager } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import { config, networkName } from "../config";

const chain = networkName === "sepolia" ? sepolia : mainnet;

const cartridgeConnector = new ControllerConnector({
  chains: [{ rpcUrl: config.rpcUrl }],
  defaultChainId: chain.id.toString(),
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
}) as any;

const provider = jsonRpcProvider({
  rpc: (_chain: Chain) => ({
    nodeUrl: config.rpcUrl,
  }),
});

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
