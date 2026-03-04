import {
  useToken,
  useTokenScores,
  useTokenUri,
  useGame,
} from "@provable-games/denshokan-sdk/react";
import { useSettingsList, type ClientSetting } from "./useSettingsList";
import { useObjectivesList, type ClientObjective } from "./useObjectivesList";

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

export interface ClientGame {
  gameId: number;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  contractAddress: string;
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
  const { settings, loading: settingsLoading } = useSettingsList(
    gameAddress ? { gameAddress } : undefined,
  );

  const { objectives, loading: objectivesLoading } = useObjectivesList(
    gameAddress ? { gameAddress } : undefined,
  );

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

  const GAME_IMAGE_OVERRIDES: Record<string, string> = {
    "Number Guess": "/number-guess.png",
    "Tic Tac Toe": "/tic-tac-toe.png",
  };

  const game: ClientGame | null = sdkGame
    ? {
        gameId: sdkGame.gameId,
        name: sdkGame.name || null,
        description: sdkGame.description || null,
        imageUrl: (sdkGame.name && GAME_IMAGE_OVERRIDES[sdkGame.name]) || (sdkGame.imageUrl ?? null),
        contractAddress: sdkGame.contractAddress,
      }
    : null;

  // Find matching setting/objective for this token
  const setting: ClientSetting | null =
    token && token.settingsId > 0
      ? settings.find((s) => s.settingsId === token.settingsId) ?? null
      : null;

  const objective: ClientObjective | null =
    token && token.objectiveId > 0
      ? objectives.find((o) => o.objectiveId === token.objectiveId) ?? null
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
