import { useEffect } from "react";
import { useChainConfig } from "../contexts/NetworkContext";

export function useSyncNetworkUrl() {
  const { chainId } = useChainConfig();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (chainId === "SN_SEPOLIA") {
      url.searchParams.set("network", "sepolia");
    } else {
      url.searchParams.delete("network");
    }
    if (url.href !== window.location.href) {
      window.history.replaceState({}, "", url.toString());
    }
  }, [chainId]);
}
