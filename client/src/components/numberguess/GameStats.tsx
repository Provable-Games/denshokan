import { Box, Paper, Typography, Grid, Chip } from "@mui/material";
import { motion } from "framer-motion";
import {
  EmojiEvents,
  Speed,
  Stars,
  Score,
  SportsScore,
} from "@mui/icons-material";
import { GameStats as GameStatsType } from "../../hooks/useNumberGuess";

interface Props {
  stats: GameStatsType;
  currentGuesses?: number;
  currentRange?: { min: number; max: number };
  attemptsRemaining?: number | null;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color?: string;
}

function StatCard({ icon, label, value, color = "primary.main" }: StatCardProps) {
  return (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        textAlign: "center",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
      }}
    >
      <Box sx={{ color }}>{icon}</Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: "bold" }}>
        {value}
      </Typography>
    </Paper>
  );
}

export default function GameStats({
  stats,
  currentGuesses,
  currentRange,
  attemptsRemaining,
}: Props) {
  const winRate =
    stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Box>
        {/* Current Game Stats */}
        {currentGuesses !== undefined && currentRange && (
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{ mb: 1 }}
            >
              Current Game
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Chip
                label={`Guesses: ${currentGuesses}`}
                color="primary"
                variant="outlined"
              />
              <Chip
                label={`Range: ${currentRange.min}-${currentRange.max}`}
                variant="outlined"
              />
              {attemptsRemaining !== null && attemptsRemaining !== undefined && (
                <Chip
                  label={
                    attemptsRemaining === 0
                      ? "No attempts left"
                      : `${attemptsRemaining} left`
                  }
                  color={attemptsRemaining <= 3 ? "error" : "default"}
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
        )}

        {/* Lifetime Stats */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Lifetime Stats
        </Typography>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 6, sm: 4 }}>
            <StatCard
              icon={<EmojiEvents />}
              label="Games Won"
              value={`${stats.gamesWon}/${stats.gamesPlayed}`}
              color="#FFD700"
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <StatCard
              icon={<SportsScore />}
              label="Win Rate"
              value={`${winRate}%`}
              color="#4CAF50"
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <StatCard
              icon={<Speed />}
              label="Best Score"
              value={stats.bestScore > 0 ? `${stats.bestScore} guesses` : "-"}
              color="#2196F3"
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <StatCard
              icon={<Stars />}
              label="Perfect Games"
              value={stats.perfectGames}
              color="#9C27B0"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 8 }}>
            <StatCard
              icon={<Score />}
              label="Total Score"
              value={stats.totalScore.toString()}
              color="#FF5722"
            />
          </Grid>
        </Grid>
      </Box>
    </motion.div>
  );
}
