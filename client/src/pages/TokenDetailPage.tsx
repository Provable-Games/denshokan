import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Typography, Grid, Button, Card, Breadcrumbs, Link as MuiLink } from "@mui/material";
import { PlayArrow, NavigateNext } from "@mui/icons-material";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  useScoreUpdates,
  useGameOverEvents,
  useConnectionStatus,
} from "@provable-games/denshokan-sdk/react";
import type { ScoreEvent, GameOverEvent } from "@provable-games/denshokan-sdk";
import { useTokenDetail } from "../hooks/useTokenDetail";
import LoadingSpinner from "../components/common/LoadingSpinner";
import TokenImage from "../components/tokens/TokenImage";
import TokenScoreCard from "../components/tokens/TokenScoreCard";
import TokenInfoCard from "../components/tokens/TokenInfoCard";
import TokenGameInfoCard from "../components/tokens/TokenGameInfoCard";
import TokenSettingsCard from "../components/tokens/TokenSettingsCard";
import TokenObjectiveCard from "../components/tokens/TokenObjectiveCard";
import TokenPropertiesChips from "../components/tokens/TokenPropertiesChips";
import ScoreHistoryTable from "../components/tokens/ScoreHistoryTable";

export default function TokenDetailPage() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const navigate = useNavigate();
  const { token, scores, game, setting, objective } = useTokenDetail(
    tokenId || "",
  );
  const { isConnected } = useConnectionStatus();

  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [liveGameOver, setLiveGameOver] = useState(false);

  const gameIds = token ? [token.gameId] : undefined;

  useScoreUpdates({
    gameIds,
    enabled: !!token,
    onEvent: useCallback(
      (e: ScoreEvent) => {
        if (e.tokenId === tokenId) {
          setLiveScore(e.score);
        }
      },
      [tokenId],
    ),
  });

  useGameOverEvents({
    gameIds,
    enabled: !!token,
    onEvent: useCallback(
      (e: GameOverEvent) => {
        if (e.tokenId === tokenId) {
          setLiveGameOver(true);
          setLiveScore(e.score);
        }
      },
      [tokenId],
    ),
  });

  if (!token) return <LoadingSpinner message="Loading token..." />;

  const displayScore =
    liveScore !== null ? liveScore : Number(token.currentScore);
  const isGameOver = liveGameOver || token.gameOver;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Breadcrumbs */}
      <Breadcrumbs separator={<NavigateNext fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink component={Link} to="/games" underline="hover" color="text.secondary">
          Games
        </MuiLink>
        {game && (
          <MuiLink component={Link} to={`/games/${game.gameId}`} underline="hover" color="text.secondary">
            {game.name || `Game #${game.gameId}`}
          </MuiLink>
        )}
        <Typography color="text.primary">
          Token #{token.tokenId.slice(0, 8)}...
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box
        sx={{
          mb: 3,
          p: 3,
          borderRadius: 3,
          background:
            "linear-gradient(135deg, rgba(124,77,255,0.08) 0%, rgba(255,109,0,0.05) 100%)",
          border: "1px solid rgba(124, 77, 255, 0.1)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 700 }}>
              {token.playerName || `Token #${token.tokenId.slice(0, 12)}...`}
            </Typography>
            {game && (
              <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                {game.name || `Game #${game.gameId}`}
              </Typography>
            )}
          </Box>
          {!isGameOver && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayArrow />}
              onClick={() => navigate(`/tokens/${tokenId}/play`)}
              sx={{
                boxShadow: "0 0 16px rgba(124, 77, 255, 0.3)",
              }}
            >
              Play Game
            </Button>
          )}
        </Box>

        <Box sx={{ mt: 2 }}>
          <TokenPropertiesChips token={token} isGameOver={isGameOver} />
        </Box>
      </Box>

      {/* Main content grid */}
      <Grid container spacing={3}>
        {/* Token Artwork */}
        {token.tokenUri && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Card variant="outlined" sx={{ overflow: "hidden" }}>
              <TokenImage
                tokenUri={token.tokenUri}
                alt={token.playerName || `Token ${token.tokenId}`}
                height={360}
              />
            </Card>
          </Grid>
        )}

        {/* Score Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <TokenScoreCard
            score={displayScore}
            isLive={isConnected}
            isGameOver={isGameOver}
          />
        </Grid>

        {/* Token Info Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <TokenInfoCard token={token} />
        </Grid>

        {/* Game Info Card */}
        <Grid size={{ xs: 12, md: 6 }}>
          <TokenGameInfoCard game={game} gameId={token.gameId} />
        </Grid>

        {/* Settings Card */}
        {setting && (
          <Grid size={{ xs: 12, md: 6 }}>
            <TokenSettingsCard setting={setting} />
          </Grid>
        )}

        {/* Objective Card */}
        {objective && (
          <Grid size={{ xs: 12, md: 6 }}>
            <TokenObjectiveCard objective={objective} />
          </Grid>
        )}

        {/* Score History */}
        <Grid size={{ xs: 12 }}>
          <ScoreHistoryTable scores={scores} />
        </Grid>
      </Grid>
    </motion.div>
  );
}
