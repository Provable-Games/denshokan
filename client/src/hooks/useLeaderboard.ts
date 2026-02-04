import { useCallback } from "react";
import {
  useLeaderboard as useSdkLeaderboard,
  useSubscription,
} from "@provable-games/denshokan-sdk/react";
import type { LeaderboardEntry, WSMessage } from "@provable-games/denshokan-sdk";

interface ClientLeaderboardEntry {
  rank: number;
  tokenId: string;
  ownerAddress: string;
  playerName: string | null;
  score: string;
}

function adaptEntry(e: LeaderboardEntry): ClientLeaderboardEntry {
  return {
    rank: e.rank,
    tokenId: e.tokenId,
    ownerAddress: e.owner,
    playerName: e.playerName || null,
    score: String(e.score),
  };
}

export function useLeaderboard(gameId: number, limit = 50) {
  const { data, isLoading, refetch } = useSdkLeaderboard(
    gameId || undefined,
    { limit },
  );

  const handleWS = useCallback(
    (_message: WSMessage) => {
      refetch();
    },
    [refetch],
  );

  useSubscription(
    ["scores", "game_over"],
    handleWS,
    gameId ? [gameId] : undefined,
  );

  return {
    entries: data?.map(adaptEntry) ?? [],
    loading: isLoading,
    refetch,
  };
}
