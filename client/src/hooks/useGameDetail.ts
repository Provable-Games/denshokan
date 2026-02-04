import { useState, useEffect } from "react";
import { useDenshokanClient } from "@provable-games/denshokan-sdk/react";
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
  const client = useDenshokanClient();
  const [game, setGame] = useState<ClientGame | null>(null);
  const [stats, setStats] = useState<ClientGameStats | null>(null);

  useEffect(() => {
    if (!gameId) return;

    client.getGame(gameId).then((g) => {
      setGame({
        gameId: g.gameId,
        contractAddress: g.contractAddress,
        name: g.name || null,
        description: g.description || null,
        imageUrl: g.imageUrl ?? null,
        createdAt: g.createdAt,
      });
    }).catch(() => {});

    client.getGameStats(gameId).then((s) => {
      setStats({
        gameId: s.gameId,
        totalTokens: s.totalTokens,
        completedGames: s.totalTokens - s.activeTokens,
        activeGames: s.activeTokens,
        uniquePlayers: s.totalPlayers,
        lastUpdated: new Date().toISOString(),
      });
    }).catch(() => {});
  }, [client, gameId]);

  return { game, stats };
}
