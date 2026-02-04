import { useParams } from "react-router-dom";
import { Box, Typography, Grid, Card, CardContent, Chip, Stack } from "@mui/material";
import { useTokenDetail } from "../hooks/useTokenDetail";
import LoadingSpinner from "../components/common/LoadingSpinner";

export default function TokenDetailPage() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const { token, scores } = useTokenDetail(tokenId || "");

  if (!token) return <LoadingSpinner message="Loading token..." />;

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        {token.playerName || `Token #${token.tokenId.slice(0, 12)}...`}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Chip label={token.gameOver ? "Completed" : "Active"} color={token.gameOver ? "success" : "primary"} />
        {token.soulbound && <Chip label="Soulbound" variant="outlined" />}
        <Chip label={`Game #${token.gameId}`} variant="outlined" />
      </Stack>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Current Score</Typography>
              <Typography variant="h3">{Number(token.currentScore).toLocaleString()}</Typography>
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
