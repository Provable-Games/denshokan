import { ReactNode, useMemo } from "react";
import { StarknetConfig } from "@starknet-start/react";
import { jsonRpcProvider } from "@starknet-start/providers";
import { voyager } from "@starknet-start/explorers";
import ControllerConnector from "@cartridge/connector/controller";
import {
  getDefaultChainId,
  getNetworkConfig,
  getAllChains,
  CHAIN_ID_FELTS,
} from "../networks";

const defaultChainId = getDefaultChainId();
const mainnetConfig = getNetworkConfig("SN_MAIN");
const sepoliaConfig = getNetworkConfig("SN_SEPOLIA");
const chains = getAllChains();

const orderedChains =
  defaultChainId === "SN_SEPOLIA"
    ? ([chains[1], chains[0]] as const)
    : ([chains[0], chains[1]] as const);

const cartridgeConnector =
  typeof window !== "undefined"
    ? new ControllerConnector({
        chains: [
          { rpcUrl: mainnetConfig.rpcUrl },
          { rpcUrl: sepoliaConfig.rpcUrl },
        ],
        defaultChainId: CHAIN_ID_FELTS[defaultChainId],
      })
    : null;

const rpcByChainId: Record<string, string> = {
  [String(chains[0].id)]: mainnetConfig.rpcUrl,
  [String(chains[1].id)]: sepoliaConfig.rpcUrl,
};

export function StarknetProvider({ children }: { children: ReactNode }) {
  const extraWallets = useMemo(() => {
    const wallets: any[] = [];
    if (cartridgeConnector) {
      wallets.push(cartridgeConnector.asWalletStandard());
    }
    return wallets;
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
      extraWallets={extraWallets}
      explorer={voyager}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
