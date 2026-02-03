import { useEffect, useRef, useCallback } from "react";
import {
  usePlayerStats,
  usePlayerTokens,
} from "@provable-games/denshokan-sdk/react";
import { useController } from "../contexts/ControllerContext";

interface ClientPlayerStats {
  totalTokens: number;
  gamesPlayed: number;
  completedGames: number;
  activeGames: number;
  [key: string]: number;
}

interface ClientToken {
  tokenId: string;
  gameId: number;
  ownerAddress: string;
  playerName: string | null;
  currentScore: string;
  gameOver: boolean;
  soulbound: boolean;
  settingsId: number;
  mintedAt: string;
}

export function usePlayerPortfolio() {
  const { address, isConnected } = useController();

  const {
    data: sdkStats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = usePlayerStats(isConnected ? address : undefined);

  const {
    data: sdkTokens,
    isLoading: tokensLoading,
    refetch: refetchTokens,
  } = usePlayerTokens(isConnected ? address : undefined);

  const stats: ClientPlayerStats | null = sdkStats
    ? {
        totalTokens: sdkStats.totalTokens,
        gamesPlayed: sdkStats.gamesPlayed,
        completedGames: sdkStats.totalTokens - sdkStats.activeTokens,
        activeGames: sdkStats.activeTokens,
      }
    : null;

  const tokens: ClientToken[] =
    sdkTokens?.data.map((t) => ({
      tokenId: t.tokenId,
      gameId: t.gameId,
      ownerAddress: t.owner,
      playerName: t.playerName || null,
      currentScore: String(t.score),
      gameOver: t.gameOver,
      soulbound: t.soulbound,
      settingsId: t.settingsId,
      mintedAt: t.mintedAt,
    })) ?? [];

  const refetch = useCallback(() => {
    refetchStats();
    refetchTokens();
  }, [refetchStats, refetchTokens]);

  return {
    stats,
    tokens,
    loading: statsLoading || tokensLoading,
    refetch,
  };
}
