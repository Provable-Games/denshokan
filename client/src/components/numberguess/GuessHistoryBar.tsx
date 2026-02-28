import { useRef, useEffect } from "react";
import { Box, Chip } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpward, ArrowDownward, CheckCircle } from "@mui/icons-material";
import { GuessHistoryEntry } from "../../hooks/useNumberGuess";
import { gameColors } from "./gameColors";

interface Props {
  guessHistory: GuessHistoryEntry[];
}

function chipStyles(feedback: -1 | 0 | 1 | null) {
  if (feedback === -1)
    return {
      bgcolor: `${gameColors.tooLow}18`,
      borderColor: `${gameColors.tooLow}66`,
      color: gameColors.tooLow,
    };
  if (feedback === 1)
    return {
      bgcolor: `${gameColors.tooHigh}18`,
      borderColor: `${gameColors.tooHigh}66`,
      color: gameColors.tooHigh,
    };
  if (feedback === 0)
    return {
      bgcolor: `${gameColors.correct}18`,
      borderColor: `${gameColors.correct}66`,
      color: gameColors.correct,
    };
  return {
    bgcolor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.2)",
    color: "text.secondary",
  };
}

function feedbackIcon(feedback: -1 | 0 | 1 | null) {
  if (feedback === -1) return <ArrowUpward sx={{ fontSize: 14 }} />;
  if (feedback === 1) return <ArrowDownward sx={{ fontSize: 14 }} />;
  if (feedback === 0) return <CheckCircle sx={{ fontSize: 14 }} />;
  return undefined;
}

export default function GuessHistoryBar({ guessHistory }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        left: scrollRef.current.scrollWidth,
        behavior: "smooth",
      });
    }
  }, [guessHistory.length]);

  if (guessHistory.length === 0) return null;

  return (
    <Box
      ref={scrollRef}
      sx={{
        display: "flex",
        gap: 1,
        overflowX: "auto",
        py: 1,
        px: 0.5,
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "thin",
        "&::-webkit-scrollbar": { height: 4 },
        "&::-webkit-scrollbar-thumb": {
          bgcolor: "rgba(255,255,255,0.1)",
          borderRadius: 2,
        },
      }}
    >
      <AnimatePresence>
        {guessHistory.map((entry, i) => {
          const styles = chipStyles(entry.feedback);
          return (
            <motion.div
              key={`${entry.value}-${entry.timestamp}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              style={{ flexShrink: 0 }}
            >
              <Chip
                label={entry.value}
                icon={feedbackIcon(entry.feedback)}
                variant="outlined"
                size="small"
                sx={{
                  fontWeight: 700,
                  ...styles,
                  "& .MuiChip-icon": { color: "inherit" },
                }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </Box>
  );
}
