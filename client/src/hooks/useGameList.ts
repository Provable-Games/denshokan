import { useGames } from "@provable-games/denshokan-sdk/react";
import type { Game } from "@provable-games/denshokan-sdk";

export interface GamesParams {
  limit?: number;
  offset?: number;
}

export interface ClientGame {
  gameId: number;
  contractAddress: string;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  createdAt: string;
}

const GAME_IMAGE_OVERRIDES: Record<string, string> = {
  "Number Guess": "/number-guess.png",
  "Tic Tac Toe": "/tic-tac-toe.png",
};

function adaptGame(g: Game): ClientGame {
  return {
    gameId: g.gameId,
    contractAddress: g.contractAddress,
    name: g.name || null,
    description: g.description || null,
    imageUrl: (g.name && GAME_IMAGE_OVERRIDES[g.name]) || (g.imageUrl ?? null),
    createdAt: g.createdAt,
  };
}

export function useGameList(params?: GamesParams) {
  const { data, isLoading, refetch } = useGames(params);

  return {
    games: data?.data.map(adaptGame) ?? [],
    total: data?.total ?? 0,
    loading: isLoading,
    refetch,
  };
}
