import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Stack,
} from "@mui/material";
import { useGameDetail } from "../hooks/useGameDetail";
import LeaderboardTable from "../components/leaderboard/LeaderboardTable";
import { GameConfigSection } from "../components/numberguess";
import LoadingSpinner from "../components/common/LoadingSpinner";

export default function GameDetailPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const id = parseInt(gameId || "0");
  const { game, stats } = useGameDetail(id);
  console.log(game, stats);

  if (!game) return <LoadingSpinner message="Loading game..." />;

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        {game.name || `Game #${id}`}
      </Typography>
      {game.description && (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {game.description}
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 4 }}>
        <Button variant="contained" onClick={() => navigate("/mint")}>
          Mint Token
        </Button>
        <Button
          variant="outlined"
          onClick={() => navigate(`/games/${id}/leaderboard`)}
        >
          Full Leaderboard
        </Button>
      </Stack>

      {stats && (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {[
            { label: "Total Tokens", value: stats.totalTokens },
            { label: "Active Games", value: stats.activeGames },
            { label: "Completed", value: stats.completedGames },
            { label: "Players", value: stats.uniquePlayers },
          ].map(({ label, value }) => (
            <Grid size={{ xs: 6, sm: 3 }} key={label}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography variant="h4">{value}</Typography>
                  <Typography color="text.secondary">{label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Game Configuration Section */}
      {game.contractAddress && (
        <Box sx={{ mt: 4 }}>
          <GameConfigSection
            gameAddress={game.contractAddress}
            gameName={game.name || undefined}
          />
        </Box>
      )}
    </Box>
  );
}
