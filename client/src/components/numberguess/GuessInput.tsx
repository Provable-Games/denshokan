import { useState, useCallback } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  CircularProgress,
} from "@mui/material";
import { motion } from "framer-motion";

interface Props {
  min: number;
  max: number;
  onGuess: (number: number) => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
  attemptsRemaining?: number | null; // null = unlimited
}

export default function GuessInput({
  min,
  max,
  onGuess,
  isLoading,
  disabled,
  attemptsRemaining,
}: Props) {
  const [value, setValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const num = parseInt(value, 10);

    if (isNaN(num)) {
      setError("Please enter a valid number");
      return;
    }

    if (num < min || num > max) {
      setError(`Number must be between ${min} and ${max}`);
      return;
    }

    setError(null);
    await onGuess(num);
    setValue("");
  }, [value, min, max, onGuess]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !isLoading && !disabled) {
        handleSubmit();
      }
    },
    [handleSubmit, isLoading, disabled]
  );

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
        <Typography variant="body1" color="text.secondary">
          Enter a number between {min} and {max}
        </Typography>

        <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
          <TextField
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            type="number"
            inputProps={{ min, max }}
            placeholder={`${min} - ${max}`}
            disabled={isLoading || disabled}
            error={!!error}
            helperText={error}
            autoFocus
            sx={{ width: 150 }}
          />

          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={isLoading || disabled || !value}
            sx={{ height: 56 }}
          >
            {isLoading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Guess"
            )}
          </Button>
        </Box>

        {attemptsRemaining !== null && attemptsRemaining !== undefined && (
          <Typography
            variant="body2"
            color={attemptsRemaining <= 3 ? "error" : "text.secondary"}
          >
            {attemptsRemaining === 0
              ? "No attempts remaining"
              : `${attemptsRemaining} attempt${attemptsRemaining !== 1 ? "s" : ""} remaining`}
          </Typography>
        )}
      </Box>
    </motion.div>
  );
}
