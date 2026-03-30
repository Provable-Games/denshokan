import { useState, useCallback } from "react";
import { Box, Typography, Grid, Card, CardContent, Button, Chip } from "@mui/material";
import { TrendingUp, Add, Flag } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import {
  useActivity,
  useScoreUpdates,
  useMintEvents,
  useGameOverEvents,
  useConnectionStatus,
} from "@provable-games/denshokan-sdk/react";
import type { ScoreEvent, MintEvent, GameOverEvent } from "@provable-games/denshokan-sdk";
import { useGames } from "@provable-games/denshokan-sdk/react";
import GameGrid from "../components/games/GameGrid";
import { GameCardSkeletonGrid } from "../components/common/SkeletonCard";
import LiveIndicator from "../components/common/LiveIndicator";

interface LiveEvent {
  type: string;
  label: string;
  tokenId: string;
  timestamp: number;
}

const MAX_LIVE_EVENTS = 10;

const eventConfig: Record<string, { icon: React.ReactNode; label: string; color: "info" | "success" | "warning" }> = {
  score: { icon: <TrendingUp fontSize="small" />, label: "Score Update", color: "info" },
  mint: { icon: <Add fontSize="small" />, label: "New Mint", color: "success" },
  game_over: { icon: <Flag fontSize="small" />, label: "Game Over", color: "warning" },
};

export default function HomePage() {
  const navigate = useNavigate();
  const { data: gamesData, isLoading: loading } = useGames();
  const games = gamesData?.data ?? [];
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

  const formatRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          textAlign: "center",
          py: { xs: 6, md: 10 },
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "600px",
            height: "400px",
            background: "radial-gradient(circle, rgba(124,77,255,0.15), transparent 70%)",
            pointerEvents: "none",
          },
        }}
      >
        <Typography
          variant="h2"
          gutterBottom
          sx={{
            fontWeight: 800,
            background: "linear-gradient(135deg, #B47CFF, #FF9E40)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            position: "relative",
          }}
        >
          Fun Factory
        </Typography>
        <Typography
          variant="h5"
          gutterBottom
          sx={{
            color: "text.secondary",
            position: "relative",
          }}
        >
          Mint and play game tokens on Starknet
        </Typography>
        <Button
          variant="contained"
          size="large"
          sx={{
            mt: 2,
            position: "relative",
            background: "linear-gradient(135deg, #7C4DFF, #3F1DCB)",
            boxShadow: "0 4px 20px rgba(124,77,255,0.3)",
            "&:hover": {
              background: "linear-gradient(135deg, #9C6FFF, #5A3DE0)",
              boxShadow: "0 6px 28px rgba(124,77,255,0.45)",
            },
          }}
          onClick={() => navigate("/mint")}
        >
          Start Minting
        </Button>
      </Box>

      <Typography variant="h4" gutterBottom sx={{ mt: 4 }}>
        Games
      </Typography>
      {loading ? <GameCardSkeletonGrid /> : <GameGrid games={games.slice(0, 6)} />}
      {games.length > 6 && (
        <Box sx={{ textAlign: "center", mt: 3 }}>
          <Button onClick={() => navigate("/games")}>View All Games</Button>
        </Box>
      )}

      {(recentActivity.length > 0 || liveEvents.length > 0) && (
        <Box sx={{ mt: 6 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography variant="h4">Recent Activity</Typography>
            {isConnected && <LiveIndicator size={8} />}
          </Box>
          <Grid container spacing={2}>
            {liveEvents.map((evt, i) => {
              const config = eventConfig[evt.type] || eventConfig.score;
              return (
                <Grid size={{ xs: 12, md: 6 }} key={`live-${evt.timestamp}-${i}`}>
                  <Card variant="outlined" sx={{ borderColor: "primary.main", borderWidth: 1 }}>
                    <CardContent sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Chip icon={config.icon as React.ReactElement} label={config.label} size="small" color={config.color} variant="outlined" />
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        Token #{String(evt.tokenId).slice(0, 12)}...
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatRelativeTime(evt.timestamp)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
            {recentActivity.map((evt, i) => {
              const config = eventConfig[evt.type] || eventConfig.score;
              return (
                <Grid size={{ xs: 12, md: 6 }} key={`static-${i}`}>
                  <Card variant="outlined">
                    <CardContent sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      <Chip icon={config.icon as React.ReactElement} label={config.label} size="small" color={config.color} variant="outlined" />
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        Token #{String(evt.tokenId).slice(0, 12)}...
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}
    </Box>
  );
}
