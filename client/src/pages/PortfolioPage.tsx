import { Box, Typography, Grid, Card, CardContent } from "@mui/material";
import { usePlayerPortfolio } from "../hooks/usePlayerPortfolio";
import { useController } from "../contexts/ControllerContext";
import TokenGrid from "../components/tokens/TokenGrid";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

export default function PortfolioPage() {
  const { isConnected } = useController();
  const { stats, tokens, loading } = usePlayerPortfolio();

  if (!isConnected) {
    return <EmptyState title="Connect your wallet" description="Connect your wallet to view your portfolio." />;
  }

  if (loading) return <LoadingSpinner message="Loading portfolio..." />;

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        My Portfolio
      </Typography>

      {stats && (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {[
            { label: "Total Tokens", value: stats.totalTokens },
            { label: "Games Played", value: stats.gamesPlayed },
            { label: "Completed", value: stats.completedGames },
            { label: "Active", value: stats.activeGames },
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

      <Typography variant="h5" gutterBottom>
        My Tokens
      </Typography>
      {tokens.length === 0 ? (
        <EmptyState title="No tokens yet" description="Mint a game token to get started." />
      ) : (
        <TokenGrid tokens={tokens} />
      )}
    </Box>
  );
}
