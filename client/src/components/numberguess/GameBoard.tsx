import { useState, useCallback } from "react";
import { Box, Paper, Typography, Button, Alert, Grid } from "@mui/material";
import { motion } from "framer-motion";
import { Refresh } from "@mui/icons-material";
import {
  useNumberGuess,
  GameStatus,
} from "../../hooks/useNumberGuess";
import DifficultySelector from "./DifficultySelector";
import GuessInput from "./GuessInput";
import FeedbackDisplay from "./FeedbackDisplay";
import GameStats from "./GameStats";
import ResultModal from "./ResultModal";
import LoadingSpinner from "../common/LoadingSpinner";

interface Props {
  gameAddress: string;
  tokenId: string;
}

export default function GameBoard({ gameAddress, tokenId }: Props) {
  const [showResultModal, setShowResultModal] = useState(false);
  const [lastGameStatus, setLastGameStatus] = useState<number | null>(null);

  const {
    startGame,
    makeGuess,
    gameStatus,
    guessCount,
    range,
    maxAttempts,
    stats,
    isLoading,
    isGuessing,
    isStarting,
    error,
    refetch,
  } = useNumberGuess(gameAddress, tokenId);

  // Calculate attempts remaining
  const attemptsRemaining =
    maxAttempts > 0 ? maxAttempts - guessCount : null;

  // Handle difficulty selection
  const handleSelectDifficulty = useCallback(
    async (settingsId: number) => {
      await startGame(settingsId);
    },
    [startGame]
  );

  // Handle guess submission
  const handleGuess = useCallback(
    async (number: number) => {
      setLastGameStatus(gameStatus);
      await makeGuess(number);
    },
    [makeGuess, gameStatus]
  );

  // Show result modal when game ends
  const handleGameEnd = useCallback(() => {
    if (
      (gameStatus === GameStatus.WON || gameStatus === GameStatus.LOST) &&
      lastGameStatus === GameStatus.PLAYING
    ) {
      setShowResultModal(true);
    }
    setLastGameStatus(gameStatus);
  }, [gameStatus, lastGameStatus]);

  // Monitor for game end
  if (
    (gameStatus === GameStatus.WON || gameStatus === GameStatus.LOST) &&
    lastGameStatus === GameStatus.PLAYING &&
    !showResultModal
  ) {
    handleGameEnd();
  }

  // Handle play again
  const handlePlayAgain = useCallback(() => {
    setShowResultModal(false);
  }, []);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <LoadingSpinner />
      </Box>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Grid container spacing={3}>
        {/* Main Game Area */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {/* No active game - show difficulty selector */}
            {(gameStatus === GameStatus.NO_GAME ||
              gameStatus === GameStatus.WON ||
              gameStatus === GameStatus.LOST) &&
              !isStarting && (
                <DifficultySelector
                  onSelect={handleSelectDifficulty}
                  isLoading={isStarting}
                />
              )}

            {/* Starting game */}
            {isStarting && (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <LoadingSpinner />
                <Typography variant="body1" sx={{ mt: 2 }}>
                  Starting game...
                </Typography>
              </Box>
            )}

            {/* Active game */}
            {gameStatus === GameStatus.PLAYING && !isStarting && (
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 3,
                  }}
                >
                  <Typography variant="h5">
                    Guess the Number!
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Refresh />}
                    onClick={refetch}
                  >
                    Refresh
                  </Button>
                </Box>

                <FeedbackDisplay
                  gameStatus={gameStatus}
                  guessCount={guessCount}
                />

                <Box sx={{ mt: 3 }}>
                  <GuessInput
                    min={range.min}
                    max={range.max}
                    onGuess={handleGuess}
                    isLoading={isGuessing}
                    attemptsRemaining={attemptsRemaining}
                  />
                </Box>
              </Box>
            )}

            {/* Game Over Display (inline) */}
            {(gameStatus === GameStatus.WON ||
              gameStatus === GameStatus.LOST) &&
              !isStarting && (
                <Box sx={{ mt: 4 }}>
                  <FeedbackDisplay
                    gameStatus={gameStatus}
                    guessCount={guessCount}
                  />
                </Box>
              )}
          </Paper>
        </Grid>

        {/* Stats Sidebar */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2 }}>
            <GameStats
              stats={stats}
              currentGuesses={
                gameStatus === GameStatus.PLAYING ? guessCount : undefined
              }
              currentRange={
                gameStatus === GameStatus.PLAYING ? range : undefined
              }
              attemptsRemaining={
                gameStatus === GameStatus.PLAYING ? attemptsRemaining : undefined
              }
            />
          </Paper>
        </Grid>
      </Grid>

      {/* Result Modal */}
      <ResultModal
        open={showResultModal}
        gameStatus={gameStatus}
        guessCount={guessCount}
        stats={stats}
        onPlayAgain={handlePlayAgain}
        onClose={() => setShowResultModal(false)}
      />
    </motion.div>
  );
}
