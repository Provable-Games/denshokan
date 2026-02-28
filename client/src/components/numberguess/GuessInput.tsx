import { useState, useCallback } from "react";
import { Box, TextField, Button, CircularProgress } from "@mui/material";
import { motion } from "framer-motion";
import { gameColors } from "./gameColors";

interface Props {
  min: number;
  max: number;
  onGuess: (number: number) => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
}

export default function GuessInput({
  min,
  max,
  onGuess,
  isLoading,
  disabled,
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
        <TextField
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          type="number"
          inputProps={{ min, max, style: { textAlign: "center", fontSize: "2rem", fontWeight: 700 } }}
          placeholder="?"
          disabled={isLoading || disabled}
          error={!!error}
          helperText={error}
          autoFocus
          sx={{
            width: 180,
            "& .MuiOutlinedInput-root": {
              "& fieldset": {
                borderColor: `${gameColors.activeRange}4D`,
              },
              "&:hover fieldset": {
                borderColor: `${gameColors.activeRange}80`,
              },
              "&.Mui-focused fieldset": {
                borderColor: gameColors.activeRange,
              },
              "&.Mui-focused": {
                boxShadow: `0 0 16px ${gameColors.activeRange}33`,
                borderRadius: 1,
              },
            },
          }}
        />

        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isLoading || disabled || !value}
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
          ) : (
            "Submit Guess"
          )}
        </Button>
      </Box>
    </motion.div>
  );
}
