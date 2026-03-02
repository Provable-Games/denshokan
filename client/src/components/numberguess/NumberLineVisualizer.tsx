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
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

function feedbackColor(feedback: -1 | 0 | 1 | null): string {
  if (feedback === -1) return gameColors.tooLow;
  if (feedback === 1) return gameColors.tooHigh;
  if (feedback === 0) return gameColors.correct;
  return "rgba(255,255,255,0.4)";
}

function feedbackArrow(feedback: -1 | 0 | 1 | null): string {
  if (feedback === -1) return "▲";
  if (feedback === 1) return "▼";
  if (feedback === 0) return "✓";
  return "?";
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

  // Track vertical position (distance from bottom of container)
  const trackBottom = 4;

  return (
    <Box sx={{ px: 1, pt: 1, pb: 0 }}>
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
          height: 64,
          overflowX: "clip",
          overflowY: "visible",
        }}
      >
        {/* Base track */}
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: trackBottom,
            height: 4,
            borderRadius: 2,
            bgcolor: "rgba(255,255,255,0.06)",
          }}
        />

        {/* Eliminated zone: too low (left) */}
        {activeLeft > 0 && (
          <motion.div
            style={{
              position: "absolute",
              left: 0,
              bottom: trackBottom,
              height: 4,
              borderRadius: "2px 0 0 2px",
              background: `${gameColors.tooLow}30`,
            }}
            animate={{ width: `${activeLeft}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
          />
        )}

        {/* Eliminated zone: too high (right) */}
        {activeRight < 100 && (
          <motion.div
            style={{
              position: "absolute",
              right: 0,
              bottom: trackBottom,
              height: 4,
              borderRadius: "0 2px 2px 0",
              background: `${gameColors.tooHigh}30`,
            }}
            animate={{ width: `${100 - activeRight}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
          />
        )}

        {/* Active range segment */}
        <motion.div
          style={{
            position: "absolute",
            bottom: trackBottom,
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
              style={{
                position: "absolute",
                bottom: trackBottom + 8,
              }}
              animate={{ left: `${Math.max(activeLeft, 2)}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: gameColors.rangeLight,
                  fontWeight: 600,
                  fontSize: "0.6rem",
                  transform:
                    activeLeft < 5 ? "none" : "translateX(-50%)",
                  display: "block",
                  whiteSpace: "nowrap",
                }}
              >
                {currentRange.min}
              </Typography>
            </motion.div>
            <motion.div
              style={{
                position: "absolute",
                bottom: trackBottom + 8,
              }}
              animate={{ left: `${Math.min(activeRight, 98)}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: gameColors.rangeLight,
                  fontWeight: 600,
                  fontSize: "0.6rem",
                  transform:
                    activeRight > 95
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
                  display: "block",
                  whiteSpace: "nowrap",
                }}
              >
                {currentRange.max}
              </Typography>
            </motion.div>
          </>
        )}

        {/* Guess markers */}
        {guessHistory.map((entry) => {
          const pct = toPercent(entry.value, fMin, fMax);
          const color = feedbackColor(entry.feedback);
          const arrow = feedbackArrow(entry.feedback);

          return (
            <motion.div
              key={`${entry.value}-${entry.timestamp}`}
              style={{
                position: "absolute",
                bottom: trackBottom,
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
              {/* Badge */}
              <Box
                sx={{
                  px: 0.75,
                  py: "2px",
                  borderRadius: 1,
                  bgcolor: `${color}18`,
                  border: `1px solid ${color}55`,
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    lineHeight: 1,
                    color,
                  }}
                >
                  {arrow}
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    color,
                    lineHeight: 1,
                  }}
                >
                  {entry.value}
                </Typography>
              </Box>
              {/* Tick line */}
              <Box
                sx={{
                  width: "1px",
                  height: 10,
                  bgcolor: `${color}66`,
                }}
              />
              {/* Dot on track */}
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: color,
                  boxShadow: `0 0 4px ${color}88`,
                }}
              />
            </motion.div>
          );
        })}
      </Box>
    </Box>
  );
}
