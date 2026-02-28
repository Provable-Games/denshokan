import { Box, Typography, Button } from "@mui/material";
import { motion } from "framer-motion";
import { PlayArrow, Replay } from "@mui/icons-material";
import { GameStats } from "../../hooks/useNumberGuess";
import { gameColors } from "./gameColors";

interface Props {
  isFirstGame: boolean;
  gameIsOver: boolean;
  stats: GameStats;
  range: { min: number; max: number };
  maxAttempts: number;
  isStarting: boolean;
  isMinting: boolean;
  onStart: () => void;
  onMintAndPlay: () => void;
}

export default function StartScreen({
  isFirstGame,
  gameIsOver,
  stats,
  range,
  maxAttempts,
  isStarting,
  isMinting,
  onStart,
  onMintAndPlay,
}: Props) {
  const busy = isStarting || isMinting;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 6,
        gap: 4,
      }}
    >
      {/* Pulsing question mark */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <Box sx={{ position: "relative", display: "inline-flex" }}>
          {/* Radial glow */}
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${gameColors.activeRange}33 0%, transparent 70%)`,
            }}
          />
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <Typography
              sx={{
                fontSize: "7rem",
                fontWeight: 900,
                lineHeight: 1,
                background: `linear-gradient(135deg, ${gameColors.activeRange}, ${gameColors.rangeLight})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                position: "relative",
              }}
            >
              ?
            </Typography>
          </motion.div>
        </Box>
      </motion.div>

      {/* Game preview */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Box
          sx={{
            display: "flex",
            gap: 4,
            justifyContent: "center",
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <Typography
              variant="caption"
              sx={{
                textTransform: "uppercase",
                letterSpacing: 1.5,
                color: "text.secondary",
              }}
            >
              Range
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {range.min} – {range.max}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "center" }}>
            <Typography
              variant="caption"
              sx={{
                textTransform: "uppercase",
                letterSpacing: 1.5,
                color: "text.secondary",
              }}
            >
              Max Attempts
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {maxAttempts > 0 ? maxAttempts : "∞"}
            </Typography>
          </Box>
        </Box>
      </motion.div>

      {/* Player record */}
      {stats.gamesPlayed > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <Typography variant="body2" color="text.secondary">
            Your record:{" "}
            <Box component="span" sx={{ color: gameColors.gold, fontWeight: 600 }}>
              {stats.gamesWon} win{stats.gamesWon !== 1 ? "s" : ""}
            </Box>{" "}
            in {stats.gamesPlayed} game{stats.gamesPlayed !== 1 ? "s" : ""}
          </Typography>
        </motion.div>
      )}

      {/* CTA Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, alignItems: "center" }}>
          {/* First game: Start Game. Game over: Mint & Play Again */}
          {gameIsOver ? (
            <Button
              variant="contained"
              size="large"
              startIcon={<Replay />}
              onClick={onMintAndPlay}
              disabled={busy}
              sx={{
                px: 5,
                py: 1.5,
                fontSize: "1.1rem",
                fontWeight: 700,
                background: `linear-gradient(135deg, ${gameColors.activeRange} 0%, #3F1DCB 100%)`,
                boxShadow: `0 4px 24px ${gameColors.activeRange}44`,
                "&:hover": {
                  background: `linear-gradient(135deg, ${gameColors.rangeLight} 0%, ${gameColors.activeRange} 100%)`,
                  boxShadow: `0 6px 32px ${gameColors.activeRange}66`,
                },
              }}
            >
              {isMinting ? "Starting..." : "Play Again"}
            </Button>
          ) : (
            <Button
              variant="contained"
              size="large"
              startIcon={<PlayArrow />}
              onClick={onStart}
              disabled={busy}
              sx={{
                px: 5,
                py: 1.5,
                fontSize: "1.1rem",
                fontWeight: 700,
                background: `linear-gradient(135deg, ${gameColors.activeRange} 0%, #3F1DCB 100%)`,
                boxShadow: `0 4px 24px ${gameColors.activeRange}44`,
                "&:hover": {
                  background: `linear-gradient(135deg, ${gameColors.rangeLight} 0%, ${gameColors.activeRange} 100%)`,
                  boxShadow: `0 6px 32px ${gameColors.activeRange}66`,
                },
              }}
            >
              {isStarting ? "Starting..." : "Start Game"}
            </Button>
          )}

          {gameIsOver && (
            <Typography variant="caption" color="text.secondary">
              Starts a fresh game with the same settings
            </Typography>
          )}
        </Box>
      </motion.div>
    </Box>
  );
}
