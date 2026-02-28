import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
} from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import { EmojiEvents, SentimentDissatisfied } from "@mui/icons-material";
import { GameStatus, GameStatusType, GameStats } from "../../hooks/useNumberGuess";
import { gameColors } from "./gameColors";

interface Props {
  open: boolean;
  gameStatus: GameStatusType;
  guessCount: number;
  stats: GameStats;
  fullRange: { min: number; max: number };
  isMinting: boolean;
  onMintAndPlay: () => void;
  onClose: () => void;
}

export default function ResultModal({
  open,
  gameStatus,
  guessCount,
  stats,
  fullRange,
  isMinting,
  onMintAndPlay,
  onClose,
}: Props) {
  const isWin = gameStatus === GameStatus.WON;
  const rangeSize = fullRange.max - fullRange.min + 1;
  const optimalGuesses = rangeSize > 0 ? Math.ceil(Math.log2(rangeSize)) : 1;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: "rgba(20,20,20,0.95)",
            backdropFilter: "blur(20px)",
            border: `1px solid ${isWin ? gameColors.correct : gameColors.lost}33`,
          },
        },
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <DialogTitle sx={{ textAlign: "center", pt: 4 }}>
              <motion.div
                animate={{
                  scale: isWin ? [1, 1.2, 1] : 1,
                  rotate: isWin ? [0, 5, -5, 0] : 0,
                }}
                transition={{ duration: 0.5, repeat: isWin ? 2 : 0 }}
              >
                {isWin ? (
                  <EmojiEvents
                    sx={{ fontSize: 80, color: gameColors.gold, mb: 2 }}
                  />
                ) : (
                  <SentimentDissatisfied
                    sx={{ fontSize: 80, color: gameColors.lost, mb: 2 }}
                  />
                )}
              </motion.div>
              <Typography variant="h4" sx={{ fontWeight: "bold" }}>
                {isWin ? "Congratulations!" : "Game Over"}
              </Typography>
            </DialogTitle>

            <DialogContent sx={{ textAlign: "center" }}>
              {isWin ? (
                <>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    You guessed the number in {guessCount} guess
                    {guessCount !== 1 ? "es" : ""}!
                  </Typography>

                  {/* Optimal comparison */}
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Optimal for this range: {optimalGuesses} guess
                    {optimalGuesses !== 1 ? "es" : ""}
                    {guessCount <= optimalGuesses && (
                      <Box
                        component="span"
                        sx={{ color: gameColors.perfect, fontWeight: 700, ml: 1 }}
                      >
                        — Optimal play!
                      </Box>
                    )}
                  </Typography>

                  {guessCount === 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Typography
                        variant="body1"
                        sx={{ color: gameColors.perfect, fontWeight: "bold", mt: 2 }}
                      >
                        Perfect Game! First guess win!
                      </Typography>
                    </motion.div>
                  )}
                </>
              ) : (
                <Typography variant="h6" color="text.secondary">
                  You ran out of attempts.
                </Typography>
              )}

              <Box
                sx={{
                  mt: 3,
                  p: 2,
                  bgcolor: "rgba(255,255,255,0.04)",
                  borderRadius: 2,
                }}
              >
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  gutterBottom
                >
                  Updated Stats
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 3,
                    mt: 1,
                  }}
                >
                  <Box>
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: "bold", color: gameColors.gold }}
                    >
                      {stats.gamesWon}/{stats.gamesPlayed}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Games Won
                    </Typography>
                  </Box>
                  <Box>
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: "bold", color: gameColors.tooLow }}
                    >
                      {stats.bestScore || "-"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Best Score
                    </Typography>
                  </Box>
                  <Box>
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: "bold", color: gameColors.score }}
                    >
                      {stats.totalScore.toString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Score
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </DialogContent>

            <DialogActions
              sx={{
                flexDirection: "column",
                alignItems: "center",
                pb: 3,
                gap: 1.5,
              }}
            >
              <Button
                variant="contained"
                onClick={onMintAndPlay}
                disabled={isMinting}
                sx={{
                  background: `linear-gradient(135deg, ${gameColors.activeRange} 0%, #3F1DCB 100%)`,
                  boxShadow: `0 4px 20px ${gameColors.activeRange}44`,
                  "&:hover": {
                    background: `linear-gradient(135deg, ${gameColors.rangeLight} 0%, ${gameColors.activeRange} 100%)`,
                  },
                }}
              >
                {isMinting ? "Starting..." : "Play Again"}
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={onClose}
                sx={{ color: "text.secondary" }}
              >
                Close
              </Button>
            </DialogActions>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
