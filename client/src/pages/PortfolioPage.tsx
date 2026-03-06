import { Box, Typography, Grid, Card, CardContent } from "@mui/material";
import { Token, PlayArrow, CheckCircle, SportsEsports, AccountBalanceWallet } from "@mui/icons-material";
import { motion } from "framer-motion";
import { usePlayerPortfolio } from "../hooks/usePlayerPortfolio";
import { useController } from "../contexts/ControllerContext";
import TokenGrid from "../components/tokens/TokenGrid";
import { TokenCardSkeletonGrid, StatCardSkeletonGrid } from "../components/common/SkeletonCard";
import EmptyState from "../components/common/EmptyState";

const statsConfig = [
  { key: "totalTokens", label: "Total", icon: <Token />, color: "#7C4DFF" },
  { key: "gamesPlayed", label: "Games", icon: <SportsEsports />, color: "#FF9E40" },
  { key: "completedGames", label: "Completed", icon: <CheckCircle />, color: "#66BB6A" },
  { key: "activeGames", label: "Active", icon: <PlayArrow />, color: "#42A5F5" },
] as const;

export default function PortfolioPage() {
  const { isConnected, login, connectors } = useController();
  const { stats, tokens, loading } = usePlayerPortfolio();

  if (!isConnected) {
    return (
      <EmptyState
        title="Connect your wallet"
        description="Connect your wallet to view your game tokens."
        icon={<AccountBalanceWallet />}
        action={{
          label: "Connect Wallet",
          onClick: () => {
            const connector = connectors[0];
            if (connector) login(connector);
          },
        }}
      />
    );
  }

  if (loading) {
    return (
      <Box>
        <Typography variant="h3" gutterBottom>My Game Tokens</Typography>
        <StatCardSkeletonGrid count={4} />
        <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>Tokens</Typography>
        <TokenCardSkeletonGrid />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        My Game Tokens
      </Typography>

      {stats && (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {statsConfig.map(({ key, label, icon, color }, i) => (
            <Grid size={{ xs: 6, sm: 3 }} key={key}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <Card
                  variant="outlined"
                  sx={{
                    borderTop: `3px solid ${color}`,
                    background: `linear-gradient(180deg, ${color}08, transparent)`,
                  }}
                >
                  <CardContent sx={{ textAlign: "center" }}>
                    <Box sx={{ color, mb: 0.5, "& .MuiSvgIcon-root": { fontSize: 28 } }}>
                      {icon}
                    </Box>
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
          icon={<Token />}
        />
      ) : (
        <TokenGrid tokens={tokens} variant="image" />
      )}
    </Box>
  );
}
