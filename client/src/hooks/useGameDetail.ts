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
  const gameAddress = gameId ? String(gameId) : undefined;
  const { data: gameData, isLoading: gameLoading, error: gameError, refetch: refetchGame } = useGame(gameAddress);
  const { data: statsData, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useGameStats(gameAddress);

  const GAME_IMAGE_OVERRIDES: Record<string, string> = {
    "Number Guess": "/number-guess.png",
    "Tic Tac Toe": "/tic-tac-toe.png",
  };

  const game: ClientGame | null = gameData
    ? {
        gameId: gameData.gameId,
        contractAddress: gameData.contractAddress,
        name: gameData.name || null,
        description: gameData.description || null,
        imageUrl: (gameData.name && GAME_IMAGE_OVERRIDES[gameData.name]) || (gameData.imageUrl ?? null),
        createdAt: gameData.createdAt,
      }
    : null;

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
