import { useState } from "react";
import { Box, Typography, Button, Collapse } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import { ExpandMore, ExpandLess } from "@mui/icons-material";
import { GameStats as GameStatsType } from "../../hooks/useNumberGuess";
import { gameColors } from "./gameColors";

interface Props {
  stats: GameStatsType;
}

export default function GameStats({ stats }: Props) {
  const [open, setOpen] = useState(false);

  const winRate =
    stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

  return (
    <Box>
      <Button
        size="small"
        onClick={() => setOpen(!open)}
        endIcon={open ? <ExpandLess /> : <ExpandMore />}
        sx={{
          color: "text.secondary",
          textTransform: "none",
          fontSize: "0.8rem",
        }}
      >
        Lifetime Stats
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <Collapse in={open}>
              <Box
                sx={{
                  display: "flex",
                  gap: 3,
                  flexWrap: "wrap",
                  justifyContent: "center",
                  py: 1.5,
                }}
              >
                <StatItem
                  label="Games Won"
                  value={`${stats.gamesWon}/${stats.gamesPlayed}`}
                  color={gameColors.gold}
                />
                <StatItem
                  label="Win Rate"
                  value={`${winRate}%`}
                  color={gameColors.correct}
                />
                <StatItem
                  label="Best Score"
                  value={stats.bestScore > 0 ? `${stats.bestScore}` : "-"}
                  color={gameColors.tooLow}
                />
                <StatItem
                  label="Perfect"
                  value={String(stats.perfectGames)}
                  color={gameColors.perfect}
                />
                <StatItem
                  label="Total Score"
                  value={stats.totalScore.toString()}
                  color={gameColors.score}
                />
              </Box>
            </Collapse>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}

function StatItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Box sx={{ textAlign: "center", minWidth: 50 }}>
      <Typography variant="body1" sx={{ fontWeight: 700, color }}>
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
          fontSize: "0.6rem",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
