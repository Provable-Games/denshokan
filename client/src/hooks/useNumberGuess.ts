import { useState, useCallback, useRef, useEffect } from "react";
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

export interface GuessHistoryEntry {
  value: number;
  feedback: GuessFeedback;
  timestamp: number;
}

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
  fullRange: { min: number; max: number };
  maxAttempts: number;
  lastFeedback: GuessFeedback;
  guessHistory: GuessHistoryEntry[];

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

// localStorage helpers for guess history persistence
const GUESS_HISTORY_PREFIX = "denshokan:guessHistory:";

function loadGuessHistory(tokenId: string): GuessHistoryEntry[] {
  try {
    const raw = localStorage.getItem(GUESS_HISTORY_PREFIX + tokenId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGuessHistory(tokenId: string, history: GuessHistoryEntry[]) {
  try {
    localStorage.setItem(
      GUESS_HISTORY_PREFIX + tokenId,
      JSON.stringify(history)
    );
  } catch {
    // Silently ignore storage errors
  }
}

function clearGuessHistory(tokenId: string) {
  try {
    localStorage.removeItem(GUESS_HISTORY_PREFIX + tokenId);
  } catch {
    // Silently ignore
  }
}

/** Poll contract.call until predicate returns true, or max retries. */
async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  maxRetries = 20,
  delayMs = 500
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const result = await fn();
      if (predicate(result)) return result;
    } catch {
      continue;
    }
  }
  return null;
}

export function useNumberGuess(
  gameAddress: string,
  tokenId: string
): UseNumberGuessReturn {
  const { address } = useAccount();
  const [isGuessing, setIsGuessing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load persisted guess history from localStorage
  const [guessHistory, setGuessHistory] = useState<GuessHistoryEntry[]>(() =>
    loadGuessHistory(tokenId)
  );
  const [lastFeedback, setLastFeedback] = useState<GuessFeedback>(() => {
    const saved = loadGuessHistory(tokenId);
    return saved.length > 0 ? saved[saved.length - 1].feedback : null;
  });
  const [fullRange, setFullRange] = useState<{ min: number; max: number }>({
    min: 1,
    max: 10,
  });
  const fullRangeCaptured = useRef(false);

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
  const { data: guessCountData, refetch: refetchGuessCount } =
    useReadContract({
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
  const { data: maxAttemptsData, refetch: refetchMaxAttempts } =
    useReadContract({
      abi: numberGuessAbi as any,
      address: gameAddress as `0x${string}`,
      functionName: "get_max_attempts",
      args: [tokenId],
    });

  // Read stats
  const { data: gamesPlayedData, refetch: refetchGamesPlayed } =
    useReadContract({
      abi: numberGuessAbi as any,
      address: gameAddress as `0x${string}`,
      functionName: "games_played",
      args: [tokenId],
    });

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
    setGuessHistory([]);
    clearGuessHistory(tokenId);
    fullRangeCaptured.current = false;

    try {
      const call = contract.populate("new_game", [tokenId]);
      await sendAsync([call]);

      // Poll until game status changes to PLAYING
      await pollUntil(
        () => contract.call("game_status", [tokenId]),
        (result) => Number(result) === GameStatus.PLAYING
      );

      refetch();
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

      // Save pre-guess state for inference
      const preRange = rangeData
        ? {
            min: Number((rangeData as any)[0] || 1),
            max: Number((rangeData as any)[1] || 10),
          }
        : { min: 1, max: 10 };

      try {
        const call = contract.populate("guess", [tokenId, number]);
        await sendAsync([call]);

        // Poll until state changes (range narrows or game ends)
        let feedback: GuessFeedback = null;

        const result = await pollUntil(
          () =>
            Promise.all([
              contract.call("game_status", [tokenId]),
              contract.call("get_range", [tokenId]),
            ]),
          ([newStatusData, newRangeData]) => {
            const newStatus = Number(newStatusData);
            const newMin = Number((newRangeData as any)[0] || preRange.min);
            const newMax = Number((newRangeData as any)[1] || preRange.max);
            return (
              newStatus !== GameStatus.PLAYING ||
              newMin !== preRange.min ||
              newMax !== preRange.max
            );
          }
        );

        if (result) {
          const [newStatusData, newRangeData] = result;
          const newStatus = Number(newStatusData);
          const newRange = {
            min: Number((newRangeData as any)[0] || preRange.min),
            max: Number((newRangeData as any)[1] || preRange.max),
          };

          if (newStatus === GameStatus.WON) {
            feedback = 0;
          } else if (newRange.min > preRange.min) {
            feedback = -1; // too low
          } else if (newRange.max < preRange.max) {
            feedback = 1; // too high
          }
        }

        setLastFeedback(feedback);
        const entry: GuessHistoryEntry = {
          value: number,
          feedback,
          timestamp: Date.now(),
        };
        setGuessHistory((prev) => {
          const updated = [...prev, entry];
          saveGuessHistory(tokenId, updated);
          return updated;
        });
        refetch();
        setIsGuessing(false);
        return feedback;
      } catch (e: any) {
        setError(e.message || "Failed to make guess");
        setIsGuessing(false);
        return null;
      }
    },
    [address, contract, sendAsync, tokenId, refetch, rangeData]
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

  // Clear stale guess history if it doesn't match contract state
  useEffect(() => {
    if (statusData === undefined || guessCountData === undefined) return;
    const status = Number(statusData);
    const contractGuessCount = Number(guessCountData);

    if (status !== GameStatus.PLAYING && guessHistory.length > 0) {
      // Game is not active — clear persisted history
      setGuessHistory([]);
      setLastFeedback(null);
      clearGuessHistory(tokenId);
    } else if (
      status === GameStatus.PLAYING &&
      contractGuessCount === 0 &&
      guessHistory.length > 0
    ) {
      // New game started but stale history remains
      setGuessHistory([]);
      setLastFeedback(null);
      clearGuessHistory(tokenId);
    }
  }, [statusData, guessCountData, tokenId]);

  // Capture full range when game starts or when initial range loads
  useEffect(() => {
    if (
      gameStatus === GameStatus.PLAYING &&
      !fullRangeCaptured.current &&
      guessCount === 0
    ) {
      fullRangeCaptured.current = true;
      setFullRange(range);
    } else if (!fullRangeCaptured.current && rangeData) {
      setFullRange(range);
    }
  }, [gameStatus, guessCount, range.min, range.max, rangeData]);

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
    fullRange,
    maxAttempts,
    lastFeedback,
    guessHistory,
    stats,
    isLoading,
    isGuessing,
    isStarting,
    error,
    refetch,
  };
}
