import { Box, Typography, Grid, Card, CardContent, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useActivity } from "@provable-games/denshokan-sdk/react";
import { useGameList } from "../hooks/useGameList";
import GameGrid from "../components/games/GameGrid";
import LoadingSpinner from "../components/common/LoadingSpinner";

export default function HomePage() {
  const navigate = useNavigate();
  const { games, loading } = useGameList();
  const { data: activityData } = useActivity({ limit: 5 });
  const recentActivity = activityData?.data ?? [];

  return (
    <Box>
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Typography variant="h2" gutterBottom>
          Fun Factory
        </Typography>
        <Typography variant="h5" color="text.secondary" gutterBottom>
          Mint and play game tokens on Starknet
        </Typography>
        <Button variant="contained" size="large" sx={{ mt: 2 }} onClick={() => navigate("/mint")}>
          Start Minting
        </Button>
      </Box>

      <Typography variant="h4" gutterBottom sx={{ mt: 4 }}>
        Games
      </Typography>
      {loading ? <LoadingSpinner /> : <GameGrid games={games.slice(0, 6)} />}
      {games.length > 6 && (
        <Box sx={{ textAlign: "center", mt: 3 }}>
          <Button onClick={() => navigate("/games")}>View All Games</Button>
        </Box>
      )}

      {recentActivity.length > 0 && (
        <Box sx={{ mt: 6 }}>
          <Typography variant="h4" gutterBottom>
            Recent Activity
          </Typography>
          <Grid container spacing={2}>
            {recentActivity.map((evt, i) => (
              <Grid size={{ xs: 12, md: 6 }} key={i}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary">
                      {evt.type}
                    </Typography>
                    <Typography>Token #{String(evt.tokenId).slice(0, 12)}...</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
}
