import { useEffect } from "react";
import { useGameStore } from "../stores/gameStore";

export function useGameDetail(gameId: number) {
  const { gameDetails, gameStats, fetchGameDetail, fetchGameStats } = useGameStore();

  useEffect(() => {
    if (gameId) {
      fetchGameDetail(gameId);
      fetchGameStats(gameId);
    }
  }, [gameId]);

  return {
    game: gameDetails[gameId] || null,
    stats: gameStats[gameId] || null,
  };
}
