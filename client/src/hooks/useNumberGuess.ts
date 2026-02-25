import { useState, useCallback, useEffect } from "react";
import {
  useAccount,
  useContract,
  useSendTransaction,
  useReadContract,
} from "@starknet-react/core";
import numberGuessAbi from "../abi/numberGuess.json";

// Game status constants matching the contract
export const GameStatus = {
  NO_GAME: 0,
  PLAYING: 1,
  WON: 2,
  LOST: 3,
} as const;

export type GameStatusType = (typeof GameStatus)[keyof typeof GameStatus];

// Guess feedback values
export type GuessFeedback = -1 | 0 | 1 | null; // too low, correct, too high, no guess yet

export interface GameSettings {
  id: number;
  name: string;
  description: string;
  min: number;
  max: number;
  maxAttempts: number;
}

export interface GameStats {
  gamesPlayed: number;
  gamesWon: number;
  bestScore: number;
  perfectGames: number;
  totalScore: bigint;
}

export interface UseNumberGuessReturn {
  // Actions
  startGame: () => Promise<void>;
  makeGuess: (number: number) => Promise<GuessFeedback>;

  // Game State
  gameStatus: GameStatusType;
  guessCount: number;
  range: { min: number; max: number };
  maxAttempts: number;
  lastFeedback: GuessFeedback;

  // Stats
  stats: GameStats;

  // Loading
  isLoading: boolean;
  isGuessing: boolean;
  isStarting: boolean;
  error: string | null;

  // Refresh
  refetch: () => void;
}

export function useNumberGuess(
  gameAddress: string,
  tokenId: string
): UseNumberGuessReturn {
  const { address } = useAccount();
  const [isGuessing, setIsGuessing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<GuessFeedback>(null);
  const [error, setError] = useState<string | null>(null);

  const { contract } = useContract({
    abi: numberGuessAbi as any,
    address: gameAddress as `0x${string}`,
  });

  const { sendAsync } = useSendTransaction({});

  // Read game status
  const { data: statusData, refetch: refetchStatus } = useReadContract({
    abi: numberGuessAbi as any,
    address: gameAddress as `0x${string}`,
    functionName: "game_status",
    args: [tokenId],
    watch: true,
  });

  // Read guess count
  const { data: guessCountData, refetch: refetchGuessCount } = useReadContract({
    abi: numberGuessAbi as any,
    address: gameAddress as `0x${string}`,
    functionName: "guess_count",
    args: [tokenId],
  });

  // Read range
  const { data: rangeData, refetch: refetchRange } = useReadContract({
    abi: numberGuessAbi as any,
    address: gameAddress as `0x${string}`,
    functionName: "get_range",
    args: [tokenId],
  });

  // Read max attempts
  const { data: maxAttemptsData, refetch: refetchMaxAttempts } = useReadContract(
    {
      abi: numberGuessAbi as any,
      address: gameAddress as `0x${string}`,
      functionName: "get_max_attempts",
      args: [tokenId],
    }
  );

  // Read stats
  const { data: gamesPlayedData, refetch: refetchGamesPlayed } = useReadContract(
    {
      abi: numberGuessAbi as any,
      address: gameAddress as `0x${string}`,
      functionName: "games_played",
      args: [tokenId],
    }
  );

  const { data: gamesWonData, refetch: refetchGamesWon } = useReadContract({
    abi: numberGuessAbi as any,
    address: gameAddress as `0x${string}`,
    functionName: "games_won",
    args: [tokenId],
  });

  const { data: bestScoreData, refetch: refetchBestScore } = useReadContract({
    abi: numberGuessAbi as any,
    address: gameAddress as `0x${string}`,
    functionName: "best_score",
    args: [tokenId],
  });

  const { data: perfectGamesData, refetch: refetchPerfectGames } =
    useReadContract({
      abi: numberGuessAbi as any,
      address: gameAddress as `0x${string}`,
      functionName: "perfect_games",
      args: [tokenId],
    });

  const { data: scoreData, refetch: refetchScore } = useReadContract({
    abi: numberGuessAbi as any,
    address: gameAddress as `0x${string}`,
    functionName: "score",
    args: [tokenId],
  });

  const refetch = useCallback(() => {
    refetchStatus();
    refetchGuessCount();
    refetchRange();
    refetchMaxAttempts();
    refetchGamesPlayed();
    refetchGamesWon();
    refetchBestScore();
    refetchPerfectGames();
    refetchScore();
  }, [
    refetchStatus,
    refetchGuessCount,
    refetchRange,
    refetchMaxAttempts,
    refetchGamesPlayed,
    refetchGamesWon,
    refetchBestScore,
    refetchPerfectGames,
    refetchScore,
  ]);

  const startGame = useCallback(async () => {
    if (!address || !contract) {
      setError("Wallet not connected");
      return;
    }

    setIsStarting(true);
    setError(null);
    setLastFeedback(null);

    try {
      const call = contract.populate("new_game", [tokenId]);
      await sendAsync([call]);

      // Refetch state after transaction
      setTimeout(() => {
        refetch();
      }, 1000);
    } catch (e: any) {
      setError(e.message || "Failed to start game");
    } finally {
      setIsStarting(false);
    }
  }, [address, contract, sendAsync, tokenId, refetch]);

  const makeGuess = useCallback(
    async (number: number): Promise<GuessFeedback> => {
      if (!address || !contract) {
        setError("Wallet not connected");
        return null;
      }

      setIsGuessing(true);
      setError(null);

      try {
        const call = contract.populate("guess", [tokenId, number]);
        const result = await sendAsync([call]);

        // The contract returns i8: -1 (too low), 0 (correct), 1 (too high)
        // We can't easily get the return value from sendAsync, so we'll
        // infer it from the new state after a short delay
        setTimeout(async () => {
          refetch();

          // Check if game is now over (won or lost)
          const newStatusData = await contract.call("game_status", [tokenId]);
          const newStatus = Number(newStatusData);

          if (newStatus === GameStatus.WON) {
            setLastFeedback(0);
          } else if (newStatus === GameStatus.LOST) {
            // Game lost - keep last feedback
          }
        }, 1000);

        // For now, return null and let the UI handle state updates via refetch
        setIsGuessing(false);
        return null;
      } catch (e: any) {
        setError(e.message || "Failed to make guess");
        setIsGuessing(false);
        return null;
      }
    },
    [address, contract, sendAsync, tokenId, refetch]
  );

  // Parse data
  const gameStatus = (
    statusData !== undefined ? Number(statusData) : GameStatus.NO_GAME
  ) as GameStatusType;
  const guessCount = guessCountData !== undefined ? Number(guessCountData) : 0;

  const range = rangeData
    ? {
        min: Number((rangeData as any)[0] || 1),
        max: Number((rangeData as any)[1] || 10),
      }
    : { min: 1, max: 10 };

  const maxAttempts =
    maxAttemptsData !== undefined ? Number(maxAttemptsData) : 0;

  const stats: GameStats = {
    gamesPlayed:
      gamesPlayedData !== undefined ? Number(gamesPlayedData) : 0,
    gamesWon: gamesWonData !== undefined ? Number(gamesWonData) : 0,
    bestScore: bestScoreData !== undefined ? Number(bestScoreData) : 0,
    perfectGames:
      perfectGamesData !== undefined ? Number(perfectGamesData) : 0,
    totalScore: scoreData !== undefined ? BigInt(scoreData.toString()) : 0n,
  };

  const isLoading = statusData === undefined;

  return {
    startGame,
    makeGuess,
    gameStatus,
    guessCount,
    range,
    maxAttempts,
    lastFeedback,
    stats,
    isLoading,
    isGuessing,
    isStarting,
    error,
    refetch,
  };
}
