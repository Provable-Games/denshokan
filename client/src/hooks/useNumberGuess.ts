import { useState, useCallback, useRef, useEffect } from "react";
import {
  useAccount,
  useContract,
  useSendTransaction,
  useReadContract,
} from "@starknet-react/core";
import { RpcProvider, TransactionFinalityStatus, hash } from "starknet";
import { useChainConfig } from "../contexts/NetworkContext";
import numberGuessAbi from "../abi/numberGuess.json";

const GUESS_MADE_SELECTOR = hash.getSelectorFromName("GuessMade");

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

  // API integration
  setGuessHistoryFromAPI: (entries: GuessHistoryEntry[]) => void;
}

/** Convert contract event result (0=correct, 1=too_low, 2=too_high) to GuessFeedback */
function contractResultToFeedback(result: number): GuessFeedback {
  switch (result) {
    case 0: return 0;   // correct
    case 1: return -1;  // too_low
    case 2: return 1;   // too_high
    default: return null;
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
  tokenId: string,
): UseNumberGuessReturn {
  const { address } = useAccount();
  const { chainConfig } = useChainConfig();
  const [isGuessing, setIsGuessing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guessHistory, setGuessHistory] = useState<GuessHistoryEntry[]>([]);
  const [lastFeedback, setLastFeedback] = useState<GuessFeedback>(null);
  const [fullRange, setFullRange] = useState<{ min: number; max: number }>({
    min: 1,
    max: 10,
  });
  const fullRangeCaptured = useRef(false);

  // Immediate state from tx receipt (overrides contract reads until they catch up)
  const [receiptRange, setReceiptRange] = useState<{ min: number; max: number } | null>(null);
  const [receiptGuessCount, setReceiptGuessCount] = useState<number | null>(null);
  const [receiptGameStatus, setReceiptGameStatus] = useState<GameStatusType | null>(null);

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

  /**
   * Replace guess history with API-sourced entries.
   * Called when API data loads or refreshes.
   */
  const setGuessHistoryFromAPI = useCallback(
    (entries: GuessHistoryEntry[]) => {
      setGuessHistory(entries);
      if (entries.length > 0) {
        setLastFeedback(entries[entries.length - 1].feedback);
      }
    },
    []
  );

  const startGame = useCallback(async () => {
    if (!address || !contract) {
      setError("Wallet not connected");
      return;
    }

    setIsStarting(true);
    setError(null);
    setLastFeedback(null);
    setGuessHistory([]);
    setReceiptRange(null);
    setReceiptGuessCount(null);
    setReceiptGameStatus(null);
    fullRangeCaptured.current = false;

    try {
      const call = contract.populate("new_game", [tokenId]);
      await sendAsync([call]);

      // Set immediate override so UI shows game board right away
      setReceiptGameStatus(GameStatus.PLAYING);

      // Poll until contract reads confirm PLAYING
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

      try {
        const t0 = performance.now();
        const call = contract.populate("guess", [tokenId, number]);
        const txResult = await sendAsync([call]);
        console.log(`[useNumberGuess] sendAsync completed in ${(performance.now() - t0).toFixed(0)}ms`);

        // Wait for receipt and parse GuessMade event
        const t1 = performance.now();
        const rpc = new RpcProvider({ nodeUrl: chainConfig.rpcUrl });
        const receipt = await rpc.waitForTransaction(txResult.transaction_hash, {
          successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
          retryInterval: 300,
        });
        console.log(`[useNumberGuess] receipt received in ${(performance.now() - t1).toFixed(0)}ms`);

        let feedback: GuessFeedback = null;
        let eventRange: { min: number; max: number } | null = null;
        let eventGuessCount: number | null = null;
        const gameAddr = BigInt(gameAddress);

        for (const event of (receipt as any).events || []) {
          const fromAddr = BigInt(event.from_address || "0x0");
          if (fromAddr !== gameAddr) continue;

          const keys: string[] = event.keys || [];
          if (keys.length < 1 || BigInt(keys[0]) !== BigInt(GUESS_MADE_SELECTOR)) continue;

          // Data: [guess_value, result, guess_count, range_min, range_max]
          const data: string[] = event.data || [];
          if (data.length >= 5) {
            const result = Number(BigInt(data[1]));
            feedback = contractResultToFeedback(result);
            eventGuessCount = Number(BigInt(data[2]));
            eventRange = {
              min: Number(BigInt(data[3])),
              max: Number(BigInt(data[4])),
            };
            console.log(`[useNumberGuess] parsed GuessMade: feedback=${feedback}, count=${eventGuessCount}, range=${eventRange.min}-${eventRange.max}`);
          }
          break;
        }

        // Fallback: if we couldn't parse the event, poll contract
        if (feedback === null) {
          console.log(`[useNumberGuess] GuessMade event not found in receipt, falling back to polling`);
          const preRange = rangeData
            ? { min: Number((rangeData as any)[0] || 1), max: Number((rangeData as any)[1] || 10) }
            : { min: 1, max: 10 };

          const pollResult = await pollUntil(
            () => Promise.all([
              contract.call("game_status", [tokenId]),
              contract.call("get_range", [tokenId]),
            ]),
            ([newStatusData, newRangeData]) => {
              const newStatus = Number(newStatusData);
              const newMin = Number((newRangeData as any)[0] || preRange.min);
              const newMax = Number((newRangeData as any)[1] || preRange.max);
              return newStatus !== GameStatus.PLAYING || newMin !== preRange.min || newMax !== preRange.max;
            }
          );

          if (pollResult) {
            const [newStatusData, newRangeData] = pollResult;
            const newStatus = Number(newStatusData);
            const newRange = {
              min: Number((newRangeData as any)[0] || preRange.min),
              max: Number((newRangeData as any)[1] || preRange.max),
            };
            if (newStatus === GameStatus.WON) feedback = 0;
            else if (newRange.min > preRange.min) feedback = -1;
            else if (newRange.max < preRange.max) feedback = 1;
          }
        }

        console.log(`[useNumberGuess] total guess time: ${(performance.now() - t0).toFixed(0)}ms, feedback=${feedback}`);
        setLastFeedback(feedback);
        setGuessHistory((prev) => [...prev, { value: number, feedback, timestamp: Date.now() }]);

        // Update range, guess count, and game status immediately from receipt data
        if (eventRange) {
          setReceiptRange(eventRange);
        }
        if (eventGuessCount !== null) {
          setReceiptGuessCount(eventGuessCount);
        }
        if (feedback === 0) {
          setReceiptGameStatus(GameStatus.WON);
        } else if (eventGuessCount !== null && maxAttemptsData !== undefined && Number(maxAttemptsData) > 0 && eventGuessCount >= Number(maxAttemptsData)) {
          setReceiptGameStatus(GameStatus.LOST);
        }

        // Still refetch to sync all other state (stats, etc.)
        refetch();
        setIsGuessing(false);
        return feedback;
      } catch (e: any) {
        setError(e.message || "Failed to make guess");
        setIsGuessing(false);
        return null;
      }
    },
    [address, contract, sendAsync, tokenId, refetch, rangeData, chainConfig.rpcUrl, gameAddress, maxAttemptsData]
  );

  // Parse data — use receipt override for immediate feedback, fall back to contract reads
  const contractGameStatus = (
    statusData !== undefined ? Number(statusData) : GameStatus.NO_GAME
  ) as GameStatusType;
  const gameStatus = receiptGameStatus ?? contractGameStatus;
  const contractGuessCount = guessCountData !== undefined ? Number(guessCountData) : 0;
  // Use receipt data for immediate feedback, fall back to contract reads
  const guessCount = receiptGuessCount ?? contractGuessCount;

  const contractRange = rangeData
    ? {
        min: Number((rangeData as any)[0] || 1),
        max: Number((rangeData as any)[1] || 10),
      }
    : { min: 1, max: 10 };
  const range = receiptRange ?? contractRange;

  // Clear receipt overrides once contract reads catch up
  useEffect(() => {
    if (receiptGuessCount !== null && contractGuessCount >= receiptGuessCount) {
      setReceiptGuessCount(null);
    }
  }, [contractGuessCount, receiptGuessCount]);

  useEffect(() => {
    if (receiptRange && rangeData) {
      const cMin = Number((rangeData as any)[0] || 1);
      const cMax = Number((rangeData as any)[1] || 10);
      if (cMin === receiptRange.min && cMax === receiptRange.max) {
        setReceiptRange(null);
      }
    }
  }, [rangeData, receiptRange]);

  useEffect(() => {
    if (receiptGameStatus !== null && contractGameStatus === receiptGameStatus) {
      setReceiptGameStatus(null);
    }
  }, [contractGameStatus, receiptGameStatus]);

  // Clear stale guess history when game state doesn't match
  useEffect(() => {
    if (statusData === undefined || guessCountData === undefined) return;
    const status = Number(statusData);
    const contractGuessCount = Number(guessCountData);

    if (status !== GameStatus.PLAYING && guessHistory.length > 0) {
      setGuessHistory([]);
      setLastFeedback(null);
    } else if (
      status === GameStatus.PLAYING &&
      contractGuessCount === 0 &&
      guessHistory.length > 0
    ) {
      setGuessHistory([]);
      setLastFeedback(null);
    }
  }, [statusData, guessCountData, tokenId]);

  // Capture full range when game starts or when initial range loads
  // Only mark as captured when we have real rangeData (not the hardcoded fallback)
  useEffect(() => {
    if (
      gameStatus === GameStatus.PLAYING &&
      !fullRangeCaptured.current &&
      guessCount === 0 &&
      rangeData
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
    setGuessHistoryFromAPI,
  };
}
