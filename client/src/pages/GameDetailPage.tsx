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
  Collapse,
} from "@mui/material";
import { Token, PlayArrow, CheckCircle, People, ExpandMore } from "@mui/icons-material";
import { motion } from "framer-motion";
import {
  useScoreUpdates,
  useMintEvents,
  useGameOverEvents,
  useConnectionStatus,
} from "@provable-games/denshokan-sdk/react";
import { useGameDetail } from "../hooks/useGameDetail";
import { useChainConfig } from "../contexts/NetworkContext";
import { GameConfigSection, QuickPlay } from "../components/numberguess";
import { StatCardSkeletonGrid } from "../components/common/SkeletonCard";
import LiveIndicator from "../components/common/LiveIndicator";
import { useState } from "react";

const statColors = ["#7C4DFF", "#FF9E40", "#66BB6A", "#42A5F5"];
const statIcons = [<Token key="t" />, <PlayArrow key="p" />, <CheckCircle key="c" />, <People key="pe" />];

export default function GameDetailPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const id = parseInt(gameId || "0");
  const { game, stats, isLoading, error, refetch } = useGameDetail(id);
  const { chainConfig } = useChainConfig();
  const { isConnected } = useConnectionStatus();
  const [configOpen, setConfigOpen] = useState(false);

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

  if (isLoading) {
    return (
      <Box>
        <Box sx={{ mb: 3 }}>
          <Box sx={{ width: "40%", height: 40, bgcolor: "action.hover", borderRadius: 1, mb: 1 }} />
          <Box sx={{ width: "60%", height: 20, bgcolor: "action.hover", borderRadius: 1 }} />
        </Box>
        <StatCardSkeletonGrid count={4} />
      </Box>
    );
  }

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

  const statEntries = stats
    ? [
        { label: "Total Tokens", value: stats.totalTokens },
        { label: "Active Games", value: stats.activeGames },
        { label: "Completed", value: stats.completedGames },
        { label: "Players", value: stats.uniquePlayers },
      ]
    : [];

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

      {/* Quick Play (Number Guess only) — placed above buttons */}
      {game.contractAddress && game.name === "Number Guess" && (
        <Box sx={{ mb: 4 }}>
          <QuickPlay gameAddress={game.contractAddress} />
        </Box>
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

      {stats && (
        <>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography variant="h5">Stats</Typography>
            {isConnected && <LiveIndicator />}
          </Box>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {statEntries.map(({ label, value }, i) => (
              <Grid size={{ xs: 6, sm: 3 }} key={label}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card
                    variant="outlined"
                    sx={{
                      borderTop: `3px solid ${statColors[i]}`,
                      background: `linear-gradient(180deg, ${statColors[i]}08, transparent)`,
                    }}
                  >
                    <CardContent sx={{ textAlign: "center" }}>
                      <Box sx={{ color: statColors[i], mb: 0.5, "& .MuiSvgIcon-root": { fontSize: 28 } }}>
                        {statIcons[i]}
                      </Box>
                      <Typography variant="h4">{value}</Typography>
                      <Typography color="text.secondary">{label}</Typography>
                    </CardContent>
                  </Card>
                </motion.div>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* Game Configuration Section — collapsible */}
      {game.contractAddress && (
        <Box sx={{ mt: 4 }}>
          <Button
            onClick={() => setConfigOpen((v) => !v)}
            endIcon={
              <ExpandMore
                sx={{
                  transform: configOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              />
            }
            sx={{ mb: 1, color: "text.secondary" }}
          >
            Game Configuration
          </Button>
          <Collapse in={configOpen}>
            <GameConfigSection
              gameAddress={game.contractAddress}
              gameName={game.name || undefined}
            />
          </Collapse>
        </Box>
      )}
    </Box>
  );
}
