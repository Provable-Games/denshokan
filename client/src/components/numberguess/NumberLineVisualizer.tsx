import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { GuessHistoryEntry } from "../../hooks/useNumberGuess";
import { gameColors } from "./gameColors";

interface Props {
  fullRange: { min: number; max: number };
  currentRange: { min: number; max: number };
  guessHistory: GuessHistoryEntry[];
}

function toPercent(
  value: number,
  min: number,
  max: number
): number {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

function feedbackColor(feedback: -1 | 0 | 1 | null): string {
  if (feedback === -1) return gameColors.tooLow;
  if (feedback === 1) return gameColors.tooHigh;
  if (feedback === 0) return gameColors.correct;
  return "rgba(255,255,255,0.4)";
}

export default function NumberLineVisualizer({
  fullRange,
  currentRange,
  guessHistory,
}: Props) {
  const fMin = fullRange.min;
  const fMax = fullRange.max;

  const activeLeft = toPercent(currentRange.min, fMin, fMax);
  const activeRight = toPercent(currentRange.max, fMin, fMax);
  const activeWidth = activeRight - activeLeft;

  return (
    <Box sx={{ px: 1, py: 2 }}>
      {/* Labels row */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          mb: 0.5,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {fMin}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {fMax}
        </Typography>
      </Box>

      {/* Track container */}
      <Box
        sx={{
          position: "relative",
          height: 48,
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* Base track */}
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 4,
            borderRadius: 2,
            bgcolor: "rgba(255,255,255,0.06)",
          }}
        />

        {/* Active range segment */}
        <motion.div
          style={{
            position: "absolute",
            height: 6,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${gameColors.activeRange}, ${gameColors.rangeLight})`,
          }}
          animate={{
            left: `${activeLeft}%`,
            width: `${Math.max(activeWidth, 0.5)}%`,
          }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        />

        {/* Active range labels */}
        {activeWidth < 95 && (
          <>
            <motion.div
              style={{ position: "absolute", top: -2 }}
              animate={{ left: `${activeLeft}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: gameColors.rangeLight,
                  fontWeight: 600,
                  fontSize: "0.65rem",
                  transform: "translateX(-50%)",
                  display: "block",
                }}
              >
                {currentRange.min}
              </Typography>
            </motion.div>
            <motion.div
              style={{ position: "absolute", top: -2 }}
              animate={{ left: `${activeRight}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: gameColors.rangeLight,
                  fontWeight: 600,
                  fontSize: "0.65rem",
                  transform: "translateX(-50%)",
                  display: "block",
                }}
              >
                {currentRange.max}
              </Typography>
            </motion.div>
          </>
        )}

        {/* Guess markers */}
        {guessHistory.map((entry, i) => {
          const pct = toPercent(entry.value, fMin, fMax);
          const above = i % 2 === 0;
          return (
            <motion.div
              key={`${entry.value}-${entry.timestamp}`}
              style={{
                position: "absolute",
                left: `${pct}%`,
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              {/* Label */}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  fontSize: "0.65rem",
                  color: feedbackColor(entry.feedback),
                  lineHeight: 1,
                  order: above ? 0 : 2,
                  mb: above ? 0.25 : 0,
                  mt: above ? 0 : 0.25,
                }}
              >
                {entry.value}
              </Typography>
              {/* Dot */}
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: feedbackColor(entry.feedback),
                  order: 1,
                  boxShadow: `0 0 6px ${feedbackColor(entry.feedback)}88`,
                }}
              />
            </motion.div>
          );
        })}
      </Box>
    </Box>
  );
}
