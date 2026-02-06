import { useState, useCallback } from "react";
import { Box, Typography, Grid, Card, CardContent, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  useActivity,
  useScoreUpdates,
  useMintEvents,
  useGameOverEvents,
  useConnectionStatus,
} from "@provable-games/denshokan-sdk/react";
import type { ScoreEvent, MintEvent, GameOverEvent } from "@provable-games/denshokan-sdk";
import { useGameList } from "../hooks/useGameList";
import GameGrid from "../components/games/GameGrid";
import LoadingSpinner from "../components/common/LoadingSpinner";

interface LiveEvent {
  type: string;
  label: string;
  tokenId: string;
  timestamp: number;
}

const MAX_LIVE_EVENTS = 10;

export default function HomePage() {
  const navigate = useNavigate();
  const { games, loading } = useGameList();
  const { data: activityData } = useActivity({ limit: 5 });
  const recentActivity = activityData?.data ?? [];
  const { isConnected } = useConnectionStatus();

  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

  const prependEvent = useCallback((event: LiveEvent) => {
    setLiveEvents((prev) => [event, ...prev].slice(0, MAX_LIVE_EVENTS));
  }, []);

  useScoreUpdates({
    onEvent: useCallback((e: ScoreEvent) => {
      prependEvent({
        type: "score",
        label: `Score Update: ${e.score.toLocaleString()}`,
        tokenId: e.tokenId,
        timestamp: Date.now(),
      });
    }, [prependEvent]),
  });

  useMintEvents({
    onEvent: useCallback((e: MintEvent) => {
      prependEvent({
        type: "mint",
        label: `New Mint in Game #${e.gameId}`,
        tokenId: e.tokenId,
        timestamp: Date.now(),
      });
    }, [prependEvent]),
  });

  useGameOverEvents({
    onEvent: useCallback((e: GameOverEvent) => {
      prependEvent({
        type: "game_over",
        label: `Game Over (Score: ${e.score.toLocaleString()})`,
        tokenId: e.tokenId,
        timestamp: Date.now(),
      });
    }, [prependEvent]),
  });

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

      {(recentActivity.length > 0 || liveEvents.length > 0) && (
        <Box sx={{ mt: 6 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography variant="h4">Recent Activity</Typography>
            {isConnected && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: "success.main",
                  }}
                />
                <Typography variant="caption" color="success.main">
                  Live
                </Typography>
              </Box>
            )}
          </Box>
          <Grid container spacing={2}>
            {liveEvents.map((evt, i) => (
              <Grid size={{ xs: 12, md: 6 }} key={`live-${evt.timestamp}-${i}`}>
                <Card variant="outlined" sx={{ borderColor: "primary.main", borderWidth: 1 }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="primary">
                      {evt.label}
                    </Typography>
                    <Typography>Token #{String(evt.tokenId).slice(0, 12)}...</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
            {recentActivity.map((evt, i) => (
              <Grid size={{ xs: 12, md: 6 }} key={`static-${i}`}>
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
