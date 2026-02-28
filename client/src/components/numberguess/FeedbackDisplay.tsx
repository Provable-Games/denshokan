import { Box, Typography } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpward,
  ArrowDownward,
  CheckCircle,
  Cancel,
} from "@mui/icons-material";
import { GameStatus, GameStatusType, GuessFeedback } from "../../hooks/useNumberGuess";
import { gameColors } from "./gameColors";

interface Props {
  gameStatus: GameStatusType;
  guessCount: number;
  lastFeedback: GuessFeedback;
  isGuessing: boolean;
  range: { min: number; max: number };
}

export default function FeedbackDisplay({
  gameStatus,
  guessCount,
  lastFeedback,
  isGuessing,
  range,
}: Props) {
  // Transaction in progress
  if (isGuessing) {
    return (
      <Box
        sx={{
          minHeight: 80,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: gameColors.activeRange,
            animation: "spin 0.8s linear infinite",
            "@keyframes spin": {
              "0%": { transform: "rotate(0deg)" },
              "100%": { transform: "rotate(360deg)" },
            },
          }}
        />
        <Typography variant="body2" color="text.secondary">
          Submitting guess...
        </Typography>
      </Box>
    );
  }

  // Game end states
  if (gameStatus === GameStatus.WON) {
    return (
      <FeedbackCard
        icon={<CheckCircle sx={{ fontSize: 48 }} />}
        text="Correct!"
        subtext={`You won in ${guessCount} guess${guessCount !== 1 ? "es" : ""}!`}
        color={gameColors.correct}
        pulse
      />
    );
  }

  if (gameStatus === GameStatus.LOST) {
    return (
      <FeedbackCard
        icon={<Cancel sx={{ fontSize: 48 }} />}
        text="Game Over"
        subtext="You ran out of attempts"
        color={gameColors.lost}
      />
    );
  }

  // Mid-game feedback
  if (lastFeedback === -1) {
    return (
      <FeedbackCard
        icon={<ArrowUpward sx={{ fontSize: 40 }} />}
        text="Too Low!"
        subtext="Try a higher number"
        color={gameColors.tooLow}
      />
    );
  }

  if (lastFeedback === 1) {
    return (
      <FeedbackCard
        icon={<ArrowDownward sx={{ fontSize: 40 }} />}
        text="Too High!"
        subtext="Try a lower number"
        color={gameColors.tooHigh}
      />
    );
  }

  // Idle state (no guess yet)
  return (
    <Box
      sx={{
        minHeight: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography variant="body1" color="text.secondary">
        The number is between{" "}
        <Box
          component="span"
          sx={{ color: "primary.main", fontWeight: 700, fontSize: "1.2rem" }}
        >
          {range.min}
        </Box>{" "}
        and{" "}
        <Box
          component="span"
          sx={{ color: "primary.main", fontWeight: 700, fontSize: "1.2rem" }}
        >
          {range.max}
        </Box>
      </Typography>
    </Box>
  );
}

function FeedbackCard({
  icon,
  text,
  subtext,
  color,
  pulse,
}: {
  icon: React.ReactNode;
  text: string;
  subtext: string;
  color: string;
  pulse?: boolean;
}) {
  return (
    <Box
      sx={{
        minHeight: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={text}
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
              color,
            }}
          >
            <motion.div
              animate={pulse ? { scale: [1, 1.1, 1] } : {}}
              transition={pulse ? { duration: 0.5, repeat: 2 } : {}}
            >
              {icon}
            </motion.div>
            <Typography
              variant="h5"
              sx={{ fontWeight: "bold", color, mt: 0.5 }}
            >
              {text}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {subtext}
            </Typography>
          </Box>
        </motion.div>
      </AnimatePresence>
    </Box>
  );
}
