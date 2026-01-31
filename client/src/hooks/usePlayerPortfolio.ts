import { useEffect } from "react";
import { useWalletStore } from "../stores/walletStore";
import { useController } from "../contexts/ControllerContext";

export function usePlayerPortfolio() {
  const { address, isConnected } = useController();
  const { playerStats, playerTokens, playerTokensLoading, statsLoading, fetchPlayerStats, fetchPlayerTokens, reset } = useWalletStore();

  useEffect(() => {
    if (isConnected && address) {
      fetchPlayerStats(address);
      fetchPlayerTokens(address);
    } else {
      reset();
    }
  }, [isConnected, address]);

  return {
    stats: playerStats,
    tokens: playerTokens,
    loading: playerTokensLoading || statsLoading,
    refetch: () => {
      if (address) {
        fetchPlayerStats(address);
        fetchPlayerTokens(address);
      }
    },
  };
}
