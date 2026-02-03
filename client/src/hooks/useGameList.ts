import { useGames } from "@provable-games/denshokan-sdk/react";
import type { Game } from "@provable-games/denshokan-sdk";

export interface ClientGame {
  gameId: number;
  contractAddress: string;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  createdAt: string;
}

function adaptGame(g: Game): ClientGame {
  return {
    gameId: g.id,
    contractAddress: g.contractAddress,
    name: g.name || null,
    description: g.description || null,
    imageUrl: g.imageUrl ?? null,
    createdAt: g.createdAt,
  };
}

export function useGameList() {
  const { data, isLoading, refetch } = useGames();

  return {
    games: data?.map(adaptGame) ?? [],
    loading: isLoading,
    refetch,
  };
}
