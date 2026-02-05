import { Box, Typography } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpward,
  ArrowDownward,
  CheckCircle,
  Cancel,
} from "@mui/icons-material";
import { GameStatus, GameStatusType } from "../../hooks/useNumberGuess";

type FeedbackType = "too_low" | "too_high" | "correct" | "lost" | null;

interface Props {
  gameStatus: GameStatusType;
  lastGuessCorrect?: boolean;
  guessCount: number;
}

export default function FeedbackDisplay({
  gameStatus,
  lastGuessCorrect,
  guessCount,
}: Props) {
  let feedbackType: FeedbackType = null;

  if (gameStatus === GameStatus.WON) {
    feedbackType = "correct";
  } else if (gameStatus === GameStatus.LOST) {
    feedbackType = "lost";
  }
  // Note: We can't easily determine too_low/too_high without tracking the last guess result
  // This would require additional state management or contract call return values

  const feedbackConfig = {
    too_low: {
      icon: <ArrowUpward sx={{ fontSize: 48 }} />,
      text: "Too Low!",
      color: "#2196F3",
      subtext: "Try a higher number",
    },
    too_high: {
      icon: <ArrowDownward sx={{ fontSize: 48 }} />,
      text: "Too High!",
      color: "#FF9800",
      subtext: "Try a lower number",
    },
    correct: {
      icon: <CheckCircle sx={{ fontSize: 64 }} />,
      text: "Correct!",
      color: "#4CAF50",
      subtext: `You won in ${guessCount} guess${guessCount !== 1 ? "es" : ""}!`,
    },
    lost: {
      icon: <Cancel sx={{ fontSize: 64 }} />,
      text: "Game Over",
      color: "#F44336",
      subtext: "You ran out of attempts",
    },
  };

  const config = feedbackType ? feedbackConfig[feedbackType] : null;

  return (
    <Box
      sx={{
        minHeight: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AnimatePresence mode="wait">
        {config && (
          <motion.div
            key={feedbackType}
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                color: config.color,
              }}
            >
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 0.5,
                  repeat: feedbackType === "correct" ? 2 : 0,
                }}
              >
                {config.icon}
              </motion.div>
              <Typography
                variant="h4"
                sx={{ fontWeight: "bold", color: config.color, mt: 1 }}
              >
                {config.text}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {config.subtext}
              </Typography>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}
