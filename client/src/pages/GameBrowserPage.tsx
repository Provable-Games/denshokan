import { Box, Typography } from "@mui/material";
import { useGameList } from "../hooks/useGameList";
import GameGrid from "../components/games/GameGrid";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

export default function GameBrowserPage() {
  const { games, loading } = useGameList();

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        Games
      </Typography>
      {loading ? (
        <LoadingSpinner message="Loading games..." />
      ) : games.length === 0 ? (
        <EmptyState title="No games found" description="Games will appear here once registered." />
      ) : (
        <GameGrid games={games} />
      )}
    </Box>
  );
}
