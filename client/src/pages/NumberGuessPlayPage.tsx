import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  Alert,
  Breadcrumbs,
  Link,
} from "@mui/material";
import { ArrowBack, Home } from "@mui/icons-material";
import { useTokenDetail } from "../hooks/useTokenDetail";
import { GameBoard } from "../components/numberguess";
import LoadingSpinner from "../components/common/LoadingSpinner";

// This would ideally come from config or API based on game ID
// For now, we'll need to configure this
const NUMBER_GUESS_ADDRESS =
  import.meta.env.VITE_NUMBER_GUESS_ADDRESS ||
  "0x0"; // Placeholder - needs to be configured after deployment

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
          {error || "Token not found"}
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

  // Get the game address from the token data
  // This assumes the token has the game's contract address
  const gameAddress = token.gameAddress || NUMBER_GUESS_ADDRESS;

  if (!gameAddress || gameAddress === "0x0") {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Number Guess game address not configured. Please set
          VITE_NUMBER_GUESS_ADDRESS in your environment.
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
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link
          component="button"
          underline="hover"
          color="inherit"
          onClick={() => navigate("/")}
          sx={{ display: "flex", alignItems: "center" }}
        >
          <Home sx={{ mr: 0.5, fontSize: 20 }} />
          Home
        </Link>
        <Link
          component="button"
          underline="hover"
          color="inherit"
          onClick={() => navigate(`/tokens/${tokenId}`)}
        >
          Token #{tokenId?.slice(0, 8)}...
        </Link>
        <Typography color="text.primary">Play</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4" gutterBottom>
            Number Guess
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Token: {token.playerName || `#${tokenId?.slice(0, 12)}...`}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<ArrowBack />}
          onClick={() => navigate(`/tokens/${tokenId}`)}
        >
          Back to Token
        </Button>
      </Box>

      {/* Game Board */}
      <GameBoard gameAddress={gameAddress} tokenId={tokenId || ""} />
    </Box>
  );
}
