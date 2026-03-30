import { Box, Typography } from "@mui/material";
import { SportsEsports } from "@mui/icons-material";
import { useGames } from "@provable-games/denshokan-sdk/react";
import GameGrid from "../components/games/GameGrid";
import { GameCardSkeletonGrid } from "../components/common/SkeletonCard";
import EmptyState from "../components/common/EmptyState";

export default function GameBrowserPage() {
  const { data: gamesData, isLoading: loading } = useGames();
  const games = gamesData?.data ?? [];

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        Games
      </Typography>
      {loading ? (
        <GameCardSkeletonGrid />
      ) : games.length === 0 ? (
        <EmptyState
          title="No games found"
          description="Games will appear here once registered."
          icon={<SportsEsports />}
        />
      ) : (
        <GameGrid games={games} />
      )}
    </Box>
  );
}
