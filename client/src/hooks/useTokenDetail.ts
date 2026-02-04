import { useState, useEffect } from "react";
import {
  useToken,
  useDenshokanClient,
} from "@provable-games/denshokan-sdk/react";

interface ClientToken {
  tokenId: string;
  gameId: number;
  gameAddress: string | null;
  ownerAddress: string;
  playerName: string | null;
  currentScore: string;
  gameOver: boolean;
  soulbound: boolean;
  mintedAt: string;
}

export function useTokenDetail(tokenId: string) {
  const { data: sdkToken } = useToken(tokenId || undefined);
  const client = useDenshokanClient();
  const [scores, setScores] = useState<any[]>([]);

  useEffect(() => {
    if (tokenId) {
      client.getTokenScores(tokenId, 100).then(setScores).catch(() => {});
    }
  }, [client, tokenId]);

  const token: ClientToken | null = sdkToken
    ? {
        tokenId: sdkToken.tokenId,
        gameId: sdkToken.gameId,
        gameAddress: (sdkToken as any).gameAddress || null,
        ownerAddress: sdkToken.owner,
        playerName: sdkToken.playerName || null,
        currentScore: String(sdkToken.score),
        gameOver: sdkToken.gameOver,
        soulbound: sdkToken.soulbound,
        mintedAt: sdkToken.mintedAt,
      }
    : null;

  const isLoading = !sdkToken && tokenId !== "";
  const error = null; // Could add error handling if needed

  return { token, scores, isLoading, error };
}
