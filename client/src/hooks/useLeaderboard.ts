import { useEffect, useCallback } from "react";
import { useLeaderboardStore } from "../stores/leaderboardStore";
import { useWebSocket } from "./useWebSocket";

export function useLeaderboard(gameId: number, limit = 50) {
  const { entries, loading, fetchLeaderboard, updateFromWS } = useLeaderboardStore();

  useEffect(() => {
    if (gameId) {
      fetchLeaderboard(gameId, { limit });
    }
  }, [gameId, limit]);

  const handleWS = useCallback(
    (channel: string, data: any) => {
      if (channel === "score_updates" || channel === "game_over_events") {
        updateFromWS(gameId, data);
      }
    },
    [gameId]
  );

  useWebSocket({
    channels: ["scores", "game_over"],
    gameIds: gameId ? [String(gameId)] : undefined,
    onMessage: handleWS,
  });

  return {
    entries: entries[gameId] || [],
    loading: loading[gameId] || false,
    refetch: () => fetchLeaderboard(gameId, { limit }),
  };
}
