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

interface Props {
  open: boolean;
  gameStatus: GameStatusType;
  guessCount: number;
  stats: GameStats;
  onPlayAgain: () => void;
  onClose: () => void;
}

export default function ResultModal({
  open,
  gameStatus,
  guessCount,
  stats,
  onPlayAgain,
  onClose,
}: Props) {
  const isWin = gameStatus === GameStatus.WON;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <DialogTitle
              sx={{
                textAlign: "center",
                pt: 4,
              }}
            >
              <motion.div
                animate={{
                  scale: isWin ? [1, 1.2, 1] : 1,
                  rotate: isWin ? [0, 5, -5, 0] : 0,
                }}
                transition={{
                  duration: 0.5,
                  repeat: isWin ? 2 : 0,
                }}
              >
                {isWin ? (
                  <EmojiEvents
                    sx={{ fontSize: 80, color: "#FFD700", mb: 2 }}
                  />
                ) : (
                  <SentimentDissatisfied
                    sx={{ fontSize: 80, color: "#F44336", mb: 2 }}
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
                  {guessCount === 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Typography
                        variant="body1"
                        sx={{ color: "#9C27B0", fontWeight: "bold", mt: 2 }}
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

              <Box sx={{ mt: 3, p: 2, bgcolor: "background.default", borderRadius: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
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
                    <Typography variant="h5" sx={{ fontWeight: "bold" }}>
                      {stats.gamesWon}/{stats.gamesPlayed}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Games Won
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: "bold" }}>
                      {stats.bestScore || "-"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Best Score
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: "bold" }}>
                      {stats.totalScore.toString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Score
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </DialogContent>

            <DialogActions sx={{ justifyContent: "center", pb: 3, gap: 2 }}>
              <Button variant="outlined" onClick={onClose}>
                Close
              </Button>
              <Button variant="contained" onClick={onPlayAgain}>
                Play Again
              </Button>
            </DialogActions>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
