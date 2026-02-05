import { useGame, useGameStats } from "@provable-games/denshokan-sdk/react";
import type { ClientGame } from "./useGameList";

interface ClientGameStats {
  gameId: number;
  totalTokens: number;
  completedGames: number;
  activeGames: number;
  uniquePlayers: number;
  lastUpdated: string;
}

export function useGameDetail(gameId: number) {
  const { data: gameData, isLoading: gameLoading, refetch: refetchGame } = useGame(gameId || undefined);
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useGameStats(gameId || undefined);

  const game: ClientGame | null = gameData
    ? {
        gameId: gameData.gameId,
        contractAddress: gameData.contractAddress,
        name: gameData.name || null,
        description: gameData.description || null,
        imageUrl: gameData.imageUrl ?? null,
        createdAt: gameData.createdAt,
      }
    : null;

  const stats: ClientGameStats | null = statsData
    ? {
        gameId: statsData.gameId,
        totalTokens: statsData.totalTokens,
        completedGames: statsData.totalTokens - statsData.activeTokens,
        activeGames: statsData.activeTokens,
        uniquePlayers: statsData.totalPlayers,
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
    refetch,
  };
}
