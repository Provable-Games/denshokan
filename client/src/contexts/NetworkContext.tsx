import { createContext, useContext, ReactNode, useMemo } from "react";
import { useNetwork } from "@starknet-react/core";
import {
  type ChainId,
  type DenshokanChainConfig,
  getDefaultChainId,
  getNetworkConfig,
} from "../networks";
import { feltToShortString } from "../utils/starknet";

interface NetworkContextValue {
  chainConfig: DenshokanChainConfig;
  chainId: ChainId;
  isMainnet: boolean;
  isSepolia: boolean;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const { chain } = useNetwork();

  const value = useMemo(() => {
    let chainId: ChainId;
    if (chain?.id) {
      const name = feltToShortString(chain.id);
      chainId = name === "SN_SEPOLIA" ? "SN_SEPOLIA" : "SN_MAIN";
    } else {
      chainId = getDefaultChainId();
    }

    const chainConfig = getNetworkConfig(chainId);
    return {
      chainConfig,
      chainId,
      isMainnet: chainId === "SN_MAIN",
      isSepolia: chainId === "SN_SEPOLIA",
    };
  }, [chain?.id]);

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}

export function useChainConfig(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx)
    throw new Error("useChainConfig must be used within NetworkProvider");
  return ctx;
}
