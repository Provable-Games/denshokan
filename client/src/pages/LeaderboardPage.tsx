import { useParams } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useGameDetail } from "../hooks/useGameDetail";
import LeaderboardTable from "../components/leaderboard/LeaderboardTable";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

export default function LeaderboardPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const id = parseInt(gameId || "0");
  const { game } = useGameDetail(id);
  const { entries, loading } = useLeaderboard(id, { limit: 100 });

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        Leaderboard {game?.name ? `- ${game.name}` : ""}
      </Typography>
      {loading ? (
        <LoadingSpinner message="Loading leaderboard..." />
      ) : entries.length === 0 ? (
        <EmptyState title="No entries yet" description="Play the game to appear on the leaderboard." />
      ) : (
        <LeaderboardTable entries={entries} />
      )}
    </Box>
  );
}
