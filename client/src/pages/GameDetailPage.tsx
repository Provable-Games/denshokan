import { useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Stack,
  Link,
} from "@mui/material";
import {
  useScoreUpdates,
  useMintEvents,
  useGameOverEvents,
  useConnectionStatus,
} from "@provable-games/denshokan-sdk/react";
import { useGameDetail } from "../hooks/useGameDetail";
import { useChainConfig } from "../contexts/NetworkContext";
import { GameConfigSection, QuickPlay } from "../components/numberguess";
import LoadingSpinner from "../components/common/LoadingSpinner";

export default function GameDetailPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const id = parseInt(gameId || "0");
  const { game, stats, isLoading, error, refetch } = useGameDetail(id);
  const { chainConfig } = useChainConfig();
  const { isConnected } = useConnectionStatus();

  const refetchingRef = useRef(false);

  const debouncedRefetch = useCallback(() => {
    if (refetchingRef.current) return;
    refetchingRef.current = true;
    refetch();
    setTimeout(() => {
      refetchingRef.current = false;
    }, 2000);
  }, [refetch]);

  useScoreUpdates({
    gameIds: [id],
    enabled: id > 0,
    onEvent: debouncedRefetch,
  });

  useMintEvents({
    gameIds: [id],
    enabled: id > 0,
    onEvent: debouncedRefetch,
  });

  useGameOverEvents({
    gameIds: [id],
    enabled: id > 0,
    onEvent: debouncedRefetch,
  });

  if (isLoading) return <LoadingSpinner message="Loading game..." />;
  if (error || !game) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Typography variant="h5" gutterBottom>
          Game not found
        </Typography>
        <Typography color="text.secondary" gutterBottom>
          {error?.message || "Unable to load game details."}
        </Typography>
        <Button variant="outlined" onClick={() => navigate("/games")}>
          Back to Games
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        {game.name || `Game #${id}`}
      </Typography>
      {game.description && (
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          {game.description}
        </Typography>
      )}

      {game.contractAddress && (
        <Typography
          variant="body2"
          sx={{ mb: 3, fontFamily: "monospace", fontSize: "0.8rem" }}
        >
          Contract:{" "}
          <Link
            href={`${chainConfig.explorerUrl}/contract/${game.contractAddress}`}
            target="_blank"
            rel="noopener"
            sx={{ fontFamily: "monospace" }}
          >
            {game.contractAddress}
          </Link>
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 4 }}>
        <Button
          variant="outlined"
          onClick={() => navigate(`/games/${id}/leaderboard`)}
        >
          Full Leaderboard
        </Button>
        <Button variant="outlined" onClick={() => navigate("/mint")}>
          Advanced Mint
        </Button>
      </Stack>

      {/* Quick Play (Number Guess only) */}
      {game.contractAddress && game.name === "Number Guess" && (
        <Box sx={{ mb: 4 }}>
          <QuickPlay gameAddress={game.contractAddress} />
        </Box>
      )}

      {stats && (
        <>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography variant="h5">Stats</Typography>
            {isConnected && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
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
        </>
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
