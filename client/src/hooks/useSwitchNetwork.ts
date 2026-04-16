import { useCallback } from "react";
import { useSwitchChain } from "@starknet-start/react";
import { CHAIN_ID_FELTS } from "../networks";

export function useSwitchNetwork() {
  const { switchChain, switchChainAsync } = useSwitchChain({});

  const switchToMainnet = useCallback(() => {
    switchChain({ chainId: CHAIN_ID_FELTS.SN_MAIN });
  }, [switchChain]);

  const switchToSepolia = useCallback(() => {
    switchChain({ chainId: CHAIN_ID_FELTS.SN_SEPOLIA });
  }, [switchChain]);

  return { switchToMainnet, switchToSepolia, switchChain, switchChainAsync };
}
