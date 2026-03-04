import { useState, useCallback, useEffect, useRef } from "react";
import { Box, TextField, Button, CircularProgress, Typography } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import { GuessFeedback } from "../../hooks/useNumberGuess";
import { gameColors } from "./gameColors";

interface Props {
  min: number;
  max: number;
  onGuess: (number: number) => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
  lastFeedback?: GuessFeedback;
}

function feedbackBorderColor(feedback: GuessFeedback): string {
  if (feedback === -1) return gameColors.tooLow;
  if (feedback === 1) return gameColors.tooHigh;
  if (feedback === 0) return gameColors.correct;
  return gameColors.activeRange;
}

export default function GuessInput({
  min,
  max,
  onGuess,
  isLoading,
  disabled,
  lastFeedback,
}: Props) {
  const [value, setValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  // Track whether we just received feedback to trigger the flash
  const [showFlash, setShowFlash] = useState(false);
  const prevFeedback = useRef(lastFeedback);

  useEffect(() => {
    if (lastFeedback !== null && lastFeedback !== prevFeedback.current) {
      setShowFlash(true);
      const timer = setTimeout(() => setShowFlash(false), 1500);
      prevFeedback.current = lastFeedback;
      return () => clearTimeout(timer);
    }
    prevFeedback.current = lastFeedback;
  }, [lastFeedback]);

  const parsedValue = parseInt(value, 10);
  const isOutOfRange = !isNaN(parsedValue) && (parsedValue < min || parsedValue > max);

  const handleSubmit = useCallback(async () => {
    const num = parseInt(value, 10);

    if (isNaN(num)) {
      setError("Please enter a valid number");
      return;
    }

    if (num < min || num > max) {
      return;
    }

    setError(null);
    await onGuess(num);
    setValue("");
  }, [value, min, max, onGuess]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !isLoading && !disabled && !isOutOfRange) {
        handleSubmit();
      }
    },
    [handleSubmit, isLoading, disabled]
  );

  const activeFeedbackColor =
    showFlash && lastFeedback != null && lastFeedback !== 0
      ? feedbackBorderColor(lastFeedback)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
        }}
      >
        {/* Directional hint */}
        <AnimatePresence mode="wait">
          {lastFeedback === -1 && (
            <motion.div
              key="low"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  color: gameColors.tooLow,
                }}
              >
                <Typography
                  sx={{ fontSize: "1.2rem", fontWeight: 800, lineHeight: 1 }}
                >
                  ▲
                </Typography>
                <Typography sx={{ fontSize: "0.85rem", fontWeight: 700 }}>
                  Go higher
                </Typography>
              </Box>
            </motion.div>
          )}
          {lastFeedback === 1 && (
            <motion.div
              key="high"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  color: gameColors.tooHigh,
                }}
              >
                <Typography
                  sx={{ fontSize: "1.2rem", fontWeight: 800, lineHeight: 1 }}
                >
                  ▼
                </Typography>
                <Typography sx={{ fontSize: "0.85rem", fontWeight: 700 }}>
                  Go lower
                </Typography>
              </Box>
            </motion.div>
          )}
          {(lastFeedback === null || lastFeedback === 0) && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: "0.85rem" }}
              >
                Enter a number between {min} and {max}
              </Typography>
            </motion.div>
          )}
        </AnimatePresence>

        <Box sx={{ position: "relative" }}>
          {/* Glow flash behind input */}
          <AnimatePresence>
            {activeFeedbackColor && (
              <motion.div
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  inset: -8,
                  borderRadius: 12,
                  background: `radial-gradient(ellipse, ${activeFeedbackColor}30, transparent 70%)`,
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              />
            )}
          </AnimatePresence>

          <TextField
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            type="number"
            inputProps={{
              min,
              max,
              step: 1,
              style: { textAlign: "center", fontSize: "2rem", fontWeight: 700 },
            }}
            placeholder="?"
            disabled={isLoading || disabled}
            error={!!error || isOutOfRange}
            helperText={error}
            autoFocus
            sx={{
              width: 180,
              position: "relative",
              zIndex: 1,
              "& .MuiOutlinedInput-root": {
                "& fieldset": {
                  borderColor: activeFeedbackColor
                    ? `${activeFeedbackColor}99`
                    : `${gameColors.activeRange}4D`,
                  borderWidth: activeFeedbackColor ? 2 : 1,
                  transition: "border-color 0.3s, border-width 0.3s",
                },
                "&:hover fieldset": {
                  borderColor: activeFeedbackColor
                    ? activeFeedbackColor
                    : `${gameColors.activeRange}80`,
                },
                "&.Mui-focused fieldset": {
                  borderColor: activeFeedbackColor
                    ? activeFeedbackColor
                    : gameColors.activeRange,
                },
                "&.Mui-focused": {
                  boxShadow: activeFeedbackColor
                    ? `0 0 20px ${activeFeedbackColor}44`
                    : `0 0 16px ${gameColors.activeRange}33`,
                  borderRadius: 1,
                },
              },
            }}
          />
        </Box>

        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isLoading || disabled || !value || isOutOfRange}
          sx={{
            width: "100%",
            maxWidth: 300,
            py: 1.5,
            fontWeight: 700,
            fontSize: "1rem",
            background: `linear-gradient(135deg, ${gameColors.activeRange} 0%, #3F1DCB 100%)`,
            boxShadow: `0 4px 20px ${gameColors.activeRange}44`,
            "&:hover": {
              background: `linear-gradient(135deg, ${gameColors.rangeLight} 0%, ${gameColors.activeRange} 100%)`,
              boxShadow: `0 6px 28px ${gameColors.activeRange}66`,
            },
            "&.Mui-disabled": {
              background: "rgba(255,255,255,0.08)",
            },
          }}
        >
          {isLoading ? (
            <CircularProgress size={24} color="inherit" />
          ) : isOutOfRange ? (
            "Outside Range"
          ) : (
            "Submit Guess"
          )}
        </Button>
      </Box>
    </motion.div>
  );
}
