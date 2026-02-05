import {
  useToken,
  useTokenScores,
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
  const {
    data: sdkToken,
    isLoading: tokenLoading,
    error: tokenError,
    refetch: refetchToken,
  } = useToken(tokenId || undefined);

  const {
    data: sdkScores,
    isLoading: scoresLoading,
    refetch: refetchScores,
  } = useTokenScores(tokenId || undefined, 100);

  const token: ClientToken | null = sdkToken
    ? {
        tokenId: sdkToken.tokenId,
        gameId: sdkToken.gameId,
        gameAddress: sdkToken.gameAddress || null,
        ownerAddress: sdkToken.owner,
        playerName: sdkToken.playerName || null,
        currentScore: String(sdkToken.score),
        gameOver: sdkToken.gameOver,
        soulbound: sdkToken.soulbound,
        mintedAt: sdkToken.mintedAt,
      }
    : null;

  const refetch = () => {
    refetchToken();
    refetchScores();
  };

  return {
    token,
    scores: sdkScores ?? [],
    isLoading: tokenLoading || scoresLoading,
    error: tokenError,
    refetch,
  };
}
