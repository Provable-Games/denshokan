import { useEffect } from "react";
import { useAccount } from "@starknet-start/react";
import { getDefaultChainId, CHAIN_ID_FELTS } from "../networks";
import { useSwitchNetwork } from "./useSwitchNetwork";

// Module-level flag survives React remounts caused by key={chainId}
let hasSwitched = false;

export function useSwitchToUrlNetwork() {
  const { status } = useAccount();
  const { switchChain } = useSwitchNetwork();

  useEffect(() => {
    if (status !== "connected" || hasSwitched) return;
    hasSwitched = true;

    const desired = getDefaultChainId();
    switchChain({ chainId: CHAIN_ID_FELTS[desired] });
  }, [status, switchChain]);
}
