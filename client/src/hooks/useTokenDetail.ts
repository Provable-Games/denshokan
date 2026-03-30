import {
  useToken,
  useTokenScores,
  useTokenUri,
  useGame,
  useSettings,
  useObjectives,
} from "@provable-games/denshokan-sdk/react";
import type { GameSettingDetails, GameObjectiveDetails } from "@provable-games/denshokan-sdk";

export interface ClientToken {
  tokenId: string;
  gameId: number;
  gameAddress: string | null;
  ownerAddress: string;
  playerName: string | null;
  currentScore: string;
  gameOver: boolean;
  soulbound: boolean;
  mintedAt: string;
  settingsId: number;
  objectiveId: number;
  startDelay: number;
  endDelay: number;
  hasContext: boolean;
  paymaster: boolean;
  mintedBy: number;
  isPlayable: boolean;
  tokenUri?: string;
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

  // Fetch token URI for artwork
  const { data: tokenUri } = useTokenUri(tokenId || undefined);

  // Fetch game info — try by contract address first, fall back to gameId
  const gameAddress = sdkToken?.gameAddress || undefined;
  const gameIdStr = sdkToken?.gameId ? String(sdkToken.gameId) : undefined;
  const gameLookup = gameAddress || gameIdStr;
  const { data: sdkGame, isLoading: gameLoading } = useGame(gameLookup);

  // Fetch settings and objectives for this game
  const { data: settingsData, isLoading: settingsLoading } = useSettings(
    gameAddress ? { gameAddress } : undefined,
  );
  const settings = settingsData?.data ?? [];

  const { data: objectivesData, isLoading: objectivesLoading } = useObjectives(
    gameAddress ? { gameAddress } : undefined,
  );
  const objectives = objectivesData?.data ?? [];

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
        settingsId: sdkToken.settingsId,
        objectiveId: sdkToken.objectiveId,
        startDelay: sdkToken.startDelay,
        endDelay: sdkToken.endDelay,
        hasContext: sdkToken.hasContext,
        paymaster: sdkToken.paymaster,
        mintedBy: sdkToken.mintedBy,
        isPlayable: sdkToken.isPlayable,
        tokenUri: tokenUri ?? undefined,
      }
    : null;

  const game = sdkGame ?? null;

  // Find matching setting/objective for this token
  const setting: GameSettingDetails | null =
    token && token.settingsId > 0
      ? settings.find((s) => s.id === token.settingsId) ?? null
      : null;

  const objective: GameObjectiveDetails | null =
    token && token.objectiveId > 0
      ? objectives.find((o) => o.id === token.objectiveId) ?? null
      : null;

  const refetch = () => {
    refetchToken();
    refetchScores();
  };

  return {
    token,
    scores: sdkScores ?? [],
    game,
    setting,
    objective,
    isLoading:
      tokenLoading ||
      scoresLoading ||
      gameLoading ||
      settingsLoading ||
      objectivesLoading,
    error: tokenError,
    refetch,
  };
}
