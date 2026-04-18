import { useGame } from "@provable-games/denshokan-sdk/react";
import type { Game } from "@provable-games/denshokan-sdk";

export function useGameDetail(gameId: number) {
  const gameAddress = gameId ? String(gameId) : undefined;
  const { data: gameData, isLoading, error, refetch } = useGame(gameAddress);

  const game: Game | null = gameData ?? null;

  return {
    game,
    isLoading,
    error,
    refetch,
  };
}
