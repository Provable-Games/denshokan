import { useGame, useGameStats } from "@provable-games/denshokan-sdk/react";
import type { Game } from "@provable-games/denshokan-sdk";

interface ClientGameStats {
  gameId: number;
  totalTokens: number;
  completedGames: number;
  activeGames: number;
  uniquePlayers: number;
  lastUpdated: string;
}

export function useGameDetail(gameId: number) {
  const gameAddress = gameId ? String(gameId) : undefined;
  const { data: gameData, isLoading: gameLoading, error: gameError, refetch: refetchGame } = useGame(gameAddress);
  const { data: statsData, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useGameStats(gameAddress);

  const game: Game | null = gameData ?? null;

  const stats: ClientGameStats | null = statsData
    ? {
        gameId: statsData.gameId,
        totalTokens: statsData.totalTokens,
        completedGames: statsData.completedGames,
        activeGames: statsData.activeGames,
        uniquePlayers: statsData.uniquePlayers,
        lastUpdated: new Date().toISOString(),
      }
    : null;

  const refetch = () => {
    refetchGame();
    refetchStats();
  };

  return {
    game,
    stats,
    isLoading: gameLoading || statsLoading,
    error: gameError || statsError,
    refetch,
  };
}
