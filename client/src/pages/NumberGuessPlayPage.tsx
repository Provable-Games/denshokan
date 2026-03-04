import { useParams, useNavigate } from "react-router-dom";
import { Box, Typography, Button, Alert, IconButton } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import { useTokenDetail } from "../hooks/useTokenDetail";
import { GameBoard } from "../components/numberguess";
import LoadingSpinner from "../components/common/LoadingSpinner";
export default function NumberGuessPlayPage() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const navigate = useNavigate();
  const { token, isLoading, error } = useTokenDetail(tokenId || "");

  if (isLoading) {
    return <LoadingSpinner message="Loading token..." />;
  }

  if (error || !token) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.message || "Token not found"}
        </Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBack />}
          onClick={() => navigate(-1)}
        >
          Go Back
        </Button>
      </Box>
    );
  }

  const gameAddress = token.gameAddress;

  if (!gameAddress || gameAddress === "0x0") {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Number Guess game address not configured for this network.
        </Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBack />}
          onClick={() => navigate(-1)}
        >
          Go Back
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 3,
        }}
      >
        <IconButton
          onClick={() => navigate(`/tokens/${tokenId}`)}
          size="small"
          sx={{ color: "text.secondary" }}
        >
          <ArrowBack />
        </IconButton>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Number Guess
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {token.playerName || `Token #${tokenId?.slice(0, 12)}...`}
          </Typography>
        </Box>
      </Box>

      {/* Game Board */}
      <GameBoard
        gameAddress={gameAddress}
        tokenId={tokenId || ""}
        tokenConfig={{
          settingsId: token.settingsId || undefined,
          objectiveId: token.objectiveId || undefined,
          playerName: token.playerName || undefined,
          soulbound: token.soulbound,
        }}
      />
    </Box>
  );
}
