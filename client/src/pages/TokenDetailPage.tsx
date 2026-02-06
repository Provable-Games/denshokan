import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Typography, Grid, Card, CardContent, Chip, Stack, Button } from "@mui/material";
import { PlayArrow } from "@mui/icons-material";
import {
  useScoreUpdates,
  useGameOverEvents,
  useConnectionStatus,
} from "@provable-games/denshokan-sdk/react";
import type { ScoreEvent, GameOverEvent } from "@provable-games/denshokan-sdk";
import { useTokenDetail } from "../hooks/useTokenDetail";
import LoadingSpinner from "../components/common/LoadingSpinner";

export default function TokenDetailPage() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const navigate = useNavigate();
  const { token, scores } = useTokenDetail(tokenId || "");
  const { isConnected } = useConnectionStatus();

  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [liveGameOver, setLiveGameOver] = useState(false);

  const gameIds = token ? [token.gameId] : undefined;

  useScoreUpdates({
    gameIds,
    enabled: !!token,
    onEvent: useCallback((e: ScoreEvent) => {
      if (e.tokenId === tokenId) {
        setLiveScore(e.score);
      }
    }, [tokenId]),
  });

  useGameOverEvents({
    gameIds,
    enabled: !!token,
    onEvent: useCallback((e: GameOverEvent) => {
      if (e.tokenId === tokenId) {
        setLiveGameOver(true);
        setLiveScore(e.score);
      }
    }, [tokenId]),
  });

  if (!token) return <LoadingSpinner message="Loading token..." />;

  const displayScore = liveScore !== null ? liveScore : Number(token.currentScore);
  const isGameOver = liveGameOver || token.gameOver;

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
        <Typography variant="h3" gutterBottom>
          {token.playerName || `Token #${token.tokenId.slice(0, 12)}...`}
        </Typography>
        {!isGameOver && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlayArrow />}
            onClick={() => navigate(`/tokens/${tokenId}/play`)}
          >
            Play Game
          </Button>
        )}
      </Box>

      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Chip label={isGameOver ? "Completed" : "Active"} color={isGameOver ? "success" : "primary"} />
        {liveGameOver && !token.gameOver && <Chip label="Game Over" color="warning" />}
        {token.soulbound && <Chip label="Soulbound" variant="outlined" />}
        <Chip label={`Game #${token.gameId}`} variant="outlined" />
      </Stack>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography color="text.secondary" gutterBottom>Current Score</Typography>
                {isConnected && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
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
              <Typography variant="h3">{displayScore.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Owner</Typography>
              <Typography variant="body1" sx={{ wordBreak: "break-all" }}>{token.ownerAddress}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {scores.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>Score History</Typography>
          {scores.map((s, i) => (
            <Box key={i} sx={{ display: "flex", justifyContent: "space-between", py: 1, borderBottom: 1, borderColor: "divider" }}>
              <Typography>{Number(s.score).toLocaleString()}</Typography>
              <Typography color="text.secondary">{new Date(s.timestamp).toLocaleDateString()}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
