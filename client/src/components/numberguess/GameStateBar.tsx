import { Box, Divider, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { gameColors } from "./gameColors";

interface Props {
  guessCount: number;
  range: { min: number; max: number };
  maxAttempts: number;
}

export default function GameStateBar({
  guessCount,
  range,
  maxAttempts,
}: Props) {
  const attemptsLeft = maxAttempts > 0 ? maxAttempts - guessCount : null;
  const numbersLeft = range.max - range.min + 1;
  const urgent = attemptsLeft !== null && attemptsLeft <= 3;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      {/* Guesses */}
      <StatGroup label="Guesses" value={String(guessCount)} />

      <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.1)" }} />

      {/* Range */}
      <StatGroup
        label="Range"
        value={`${range.min}–${range.max}`}
      />

      <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.1)" }} />

      {/* Attempts Left */}
      {attemptsLeft !== null ? (
        <motion.div
          animate={urgent ? { scale: [1, 1.1, 1] } : {}}
          transition={
            urgent
              ? { duration: 0.6, repeat: Infinity, repeatDelay: 1 }
              : {}
          }
        >
          <StatGroup
            label="Attempts Left"
            value={String(attemptsLeft)}
            color={
              urgent ? gameColors.lost : undefined
            }
          />
        </motion.div>
      ) : (
        <StatGroup label="Attempts Left" value="∞" />
      )}

      <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.1)" }} />

      {/* Numbers Left */}
      <StatGroup
        label="Numbers Left"
        value={String(numbersLeft)}
        color={gameColors.rangeLight}
      />
    </Box>
  );
}

function StatGroup({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Box sx={{ textAlign: "center", minWidth: 60 }}>
      <Typography
        variant="caption"
        sx={{
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "text.secondary",
          fontSize: "0.6rem",
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="body1"
        sx={{
          fontWeight: 700,
          color: color || "text.primary",
          lineHeight: 1.2,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
