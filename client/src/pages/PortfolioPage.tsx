import { Box, Typography, Grid, Card, CardContent } from "@mui/material";
import { motion } from "framer-motion";
import { usePlayerPortfolio } from "../hooks/usePlayerPortfolio";
import { useController } from "../contexts/ControllerContext";
import TokenGrid from "../components/tokens/TokenGrid";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

const statsConfig = [
  { key: "totalTokens", label: "Total" },
  { key: "gamesPlayed", label: "Games" },
  { key: "completedGames", label: "Completed" },
  { key: "activeGames", label: "Active" },
] as const;

export default function PortfolioPage() {
  const { isConnected } = useController();
  const { stats, tokens, loading } = usePlayerPortfolio();

  console.log(tokens);

  if (!isConnected) {
    return (
      <EmptyState
        title="Connect your wallet"
        description="Connect your wallet to view your game tokens."
      />
    );
  }

  if (loading) return <LoadingSpinner message="Loading game tokens..." />;

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        My Game Tokens
      </Typography>

      {stats && (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {statsConfig.map(({ key, label }, i) => (
            <Grid size={{ xs: 6, sm: 3 }} key={key}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <Card variant="outlined">
                  <CardContent sx={{ textAlign: "center" }}>
                    <Typography variant="h4">{stats[key]}</Typography>
                    <Typography color="text.secondary">{label}</Typography>
                  </CardContent>
                </Card>
              </motion.div>
            </Grid>
          ))}
        </Grid>
      )}

      <Typography variant="h5" gutterBottom>
        Tokens
      </Typography>
      {tokens.length === 0 ? (
        <EmptyState
          title="No tokens yet"
          description="Mint a game token to get started."
        />
      ) : (
        <TokenGrid tokens={tokens} />
      )}
    </Box>
  );
}
