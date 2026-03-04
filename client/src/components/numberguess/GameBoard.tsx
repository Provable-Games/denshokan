import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Paper, Alert } from "@mui/material";
import { motion } from "framer-motion";
import {
  useAccount,
  useContract,
  useSendTransaction,
} from "@starknet-react/core";
import { RpcProvider, CairoOption, CairoOptionVariant, TransactionFinalityStatus } from "starknet";
import {
  useNumberGuess,
  GameStatus,
  type GuessHistoryEntry,
} from "../../hooks/useNumberGuess";
import { useNumberGuessConfig } from "../../hooks/useNumberGuessConfig";
import {
  useSessionGuesses,
  useNumberGuessStats,
} from "../../hooks/useNumberGuessAPI";
import type {
  ApiGuess,
} from "../../hooks/numberGuessApi.types";
import { useChainConfig } from "../../contexts/NetworkContext";
import numberGuessAbi from "../../abi/numberGuess.json";
import StartScreen from "./StartScreen";
import GameStateBar from "./GameStateBar";
import NumberLineVisualizer from "./NumberLineVisualizer";
import FeedbackDisplay from "./FeedbackDisplay";
import GuessInput from "./GuessInput";
import GuessHistoryBar from "./GuessHistoryBar";
import GameStats from "./GameStats";
import ResultModal from "./ResultModal";
import LoadingSpinner from "../common/LoadingSpinner";

/** Convert API result string to GuessFeedback */
function apiResultToFeedback(result: string): -1 | 0 | 1 | null {
  switch (result) {
    case "correct": return 0;
    case "too_low": return -1;
    case "too_high": return 1;
    default: return null;
  }
}

interface TokenConfig {
  settingsId?: number;
  objectiveId?: number;
  playerName?: string;
  soulbound?: boolean;
}

interface Props {
  gameAddress: string;
  tokenId: string;
  tokenConfig?: TokenConfig;
  /** When true, game was already started via QuickPlay — suppress start screen while loading */
  gameAlreadyStarted?: boolean;
}

export default function GameBoard({
  gameAddress,
  tokenId,
  tokenConfig,
  gameAlreadyStarted = false,
}: Props) {
  const navigate = useNavigate();
  const { address } = useAccount();
  const { chainConfig } = useChainConfig();
  const [showResultModal, setShowResultModal] = useState(false);
  const [lastGameStatus, setLastGameStatus] = useState<number | null>(null);
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  const { contract: gameContract } = useContract({
    abi: numberGuessAbi as any,
    address: gameAddress as `0x${string}`,
  });

  const { sendAsync: sendMintTx } = useSendTransaction({});

  const {
    startGame,
    makeGuess,
    gameStatus,
    guessCount,
    range,
    fullRange,
    maxAttempts,
    lastFeedback,
    guessHistory: localGuessHistory,
    stats,
    isLoading,
    isGuessing,
    isStarting,
    error,
    refetch: refetchGame,
    setGuessHistoryFromAPI,
  } = useNumberGuess(gameAddress, tokenId);

  // API: fetch session + guess history
  const { data: apiSessionData, refetch: refetchApiGuesses } =
    useSessionGuesses(tokenId);

  // API: global stats (for GameStats component)
  const { data: globalStats } = useNumberGuessStats();

  // Aggressively poll when QuickPlay already started the game but contract reads haven't caught up
  useEffect(() => {
    if (!gameAlreadyStarted || gameStatus !== GameStatus.NO_GAME) return;
    const interval = setInterval(() => refetchGame(), 500);
    return () => clearInterval(interval);
  }, [gameAlreadyStarted, gameStatus, refetchGame]);

  // Convert API guesses to local GuessHistoryEntry format
  const apiGuessHistory: GuessHistoryEntry[] =
    apiSessionData?.guesses.map((g: ApiGuess) => ({
      value: g.guessValue,
      feedback: apiResultToFeedback(g.result),
      timestamp: new Date(g.blockTimestamp).getTime(),
    })) ?? [];

  // Use whichever history is more up-to-date (local updates instantly from receipt)
  const guessHistory =
    localGuessHistory.length >= apiGuessHistory.length
      ? localGuessHistory
      : apiGuessHistory;

  // Sync API history into hook state when it loads
  useEffect(() => {
    if (apiGuessHistory.length > 0) {
      setGuessHistoryFromAPI(apiGuessHistory);
    }
  }, [apiSessionData]);

  // Get settings-based full range (survives page refresh)
  const { settings } = useNumberGuessConfig(gameAddress);
  const settingsFullRange = (() => {
    const sid = tokenConfig?.settingsId;
    if (sid != null) {
      const match = settings.find((s) => s.id === sid);
      if (match) return { min: match.min, max: match.max };
    }
    return fullRange;
  })();

  // Handle guess submission
  const handleGuess = useCallback(
    async (number: number) => {
      setLastGameStatus(gameStatus);
      await makeGuess(number);
    },
    [makeGuess, gameStatus],
  );

  // Show result modal when game ends
  useEffect(() => {
    if (
      (gameStatus === GameStatus.WON || gameStatus === GameStatus.LOST) &&
      lastGameStatus === GameStatus.PLAYING &&
      !showResultModal
    ) {
      setShowResultModal(true);
    }
    setLastGameStatus(gameStatus);
  }, [gameStatus]);

  // Mint a new token and start a new game, then navigate
  const handleMintAndPlay = useCallback(async () => {
    if (!address || !gameContract) return;

    setIsMinting(true);
    setMintError(null);

    try {
      const none = <T,>() => new CairoOption<T>(CairoOptionVariant.None);
      const some = <T,>(val: T) =>
        new CairoOption<T>(CairoOptionVariant.Some, val);

      // Step 1: Mint a new token with the same configuration as the current token
      const cfg = tokenConfig || {};
      const mintCall = gameContract.populate("mint_game", [
        cfg.playerName ? some(cfg.playerName) : none(), // player_name
        cfg.settingsId ? some(cfg.settingsId) : none(), // settings_id
        none(), // start
        none(), // end
        cfg.objectiveId ? some(cfg.objectiveId) : none(), // objective_id
        none(), // context
        none(), // client_url
        none(), // renderer_address
        none(), // skills_address
        address, // to
        cfg.soulbound ?? false, // soulbound
        false, // paymaster
        0, // salt
        0, // metadata
      ]);

      const mintResult = await sendMintTx([mintCall]);

      // Step 2: Get the new token ID from the receipt
      const rpc = new RpcProvider({ nodeUrl: chainConfig.rpcUrl });
      const receipt = await rpc.waitForTransaction(mintResult.transaction_hash, {
        successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
        retryInterval: 300,
      });

      const denshokanAddr = BigInt(chainConfig.denshokanAddress);
      let newTokenId: string | null = null;

      for (const event of (receipt as any).events || []) {
        const fromAddr = BigInt(event.from_address || "0x0");
        if (fromAddr !== denshokanAddr) continue;

        // Transfer event: keys = [selector, from, to, token_id_low, token_id_high]
        // Mint: from = 0x0
        const keys: string[] = event.keys || [];
        if (keys.length >= 5 && BigInt(keys[1]) === 0n) {
          // Reconstruct felt252 token_id from u256 (low + high * 2^128)
          const low = BigInt(keys[3]);
          const high = BigInt(keys[4]);
          const fullId = low + high * 2n ** 128n;
          newTokenId = "0x" + fullId.toString(16);
          break;
        }
      }

      if (!newTokenId) {
        throw new Error("Could not find minted token ID in receipt");
      }

      // Step 3: Start a new game on the minted token
      const newGameCall = gameContract.populate("new_game", [newTokenId]);
      await sendMintTx([newGameCall]);

      // Step 4: Navigate to the new play page
      setShowResultModal(false);
      navigate(`/tokens/${newTokenId}/play`);
    } catch (e: any) {
      setMintError(e.message || "Failed to mint and play");
    } finally {
      setIsMinting(false);
    }
  }, [address, gameContract, sendMintTx, chainConfig, tokenConfig, navigate]);

  // Handle closing the modal without minting
  const handleCloseModal = useCallback(() => {
    setShowResultModal(false);
  }, []);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <LoadingSpinner />
      </Box>
    );
  }

  // If game was started via QuickPlay, suppress start screen while contract reads catch up
  const waitingForGameStart = gameAlreadyStarted && gameStatus === GameStatus.NO_GAME;
  const showStartScreen =
    !waitingForGameStart &&
    (gameStatus === GameStatus.NO_GAME ||
    gameStatus === GameStatus.WON ||
    gameStatus === GameStatus.LOST);

  const gameIsOver =
    gameStatus === GameStatus.WON || gameStatus === GameStatus.LOST;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Paper sx={{ p: 3, maxWidth: 600, mx: "auto" }}>
        {(error || mintError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || mintError}
          </Alert>
        )}

        {/* Start / Play Again screen */}
        {showStartScreen && !isStarting && !isMinting && (
          <StartScreen
            isFirstGame={gameStatus === GameStatus.NO_GAME}
            gameIsOver={gameIsOver}
            stats={stats}
            range={range}
            maxAttempts={maxAttempts}
            isStarting={isStarting}
            isMinting={isMinting}
            onStart={startGame}
            onMintAndPlay={handleMintAndPlay}
          />
        )}

        {/* Waiting for game to start (QuickPlay already sent new_game tx) */}
        {waitingForGameStart && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <LoadingSpinner message="Starting game..." />
          </Box>
        )}

        {/* Starting / Minting spinner */}
        {(isStarting || isMinting) && (
          <Box sx={{ textAlign: "center", py: 6 }}>
            <LoadingSpinner />
          </Box>
        )}

        {/* Active game */}
        {gameStatus === GameStatus.PLAYING && !isStarting && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <GameStateBar
              guessCount={guessCount}
              range={range}
              maxAttempts={maxAttempts}
            />

            <NumberLineVisualizer
              fullRange={settingsFullRange}
              currentRange={range}
              guessHistory={guessHistory}
            />

            <FeedbackDisplay
              gameStatus={gameStatus}
              guessCount={guessCount}
              lastFeedback={lastFeedback}
              isGuessing={isGuessing}
              range={range}
            />

            <GuessInput
              min={range.min}
              max={range.max}
              onGuess={handleGuess}
              isLoading={isGuessing}
              lastFeedback={lastFeedback}
            />

            <GuessHistoryBar guessHistory={guessHistory} />

            <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
              <GameStats stats={stats} globalStats={globalStats ?? undefined} />
            </Box>
          </Box>
        )}
      </Paper>

      {/* Result Modal */}
      <ResultModal
        open={showResultModal}
        gameStatus={gameStatus}
        guessCount={guessCount}
        stats={stats}
        fullRange={settingsFullRange}
        isMinting={isMinting}
        onMintAndPlay={handleMintAndPlay}
        onClose={handleCloseModal}
      />
    </motion.div>
  );
}
