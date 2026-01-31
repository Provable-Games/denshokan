import { useEffect } from "react";
import { useGameStore } from "../stores/gameStore";

export function useGameList() {
  const { games, gamesLoading, fetchGames } = useGameStore();

  useEffect(() => {
    if (games.length === 0) {
      fetchGames();
    }
  }, []);

  return { games, loading: gamesLoading, refetch: fetchGames };
}
