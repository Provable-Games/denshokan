import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Box, Typography, Button, Alert, IconButton } from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import { useTokenDetail } from "../hooks/useTokenDetail";
import { GameBoard } from "../components/numberguess";
import LoadingSpinner from "../components/common/LoadingSpinner";
export default function NumberGuessPlayPage() {
  const { tokenId } = useParams<{ tokenId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as any;
  const gameStarted = locationState?.gameStarted === true;
  const stateGameAddress: string | null = locationState?.gameAddress || null;
  const { token, game, isLoading, error } = useTokenDetail(tokenId || "");

  // When arriving from QuickPlay/PlayAgain, the token may not be indexed yet.
  // Skip the loading/error gate and let GameBoard render with the token ID.
  if (!gameStarted) {
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
  }

  const gameAddress = token?.gameAddress || game?.contractAddress || stateGameAddress;

  console.log("[NumberGuessPlayPage]", {
    tokenId,
    tokenGameAddress: token?.gameAddress,
    gameContractAddress: game?.contractAddress,
    resolvedGameAddress: gameAddress,
    gameId: token?.gameId,
    game,
  });

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
            {token?.playerName || `Token #${tokenId?.slice(0, 12)}...`}
          </Typography>
        </Box>
      </Box>

      {/* Game Board */}
      <GameBoard
        key={tokenId}
        gameAddress={gameAddress}
        tokenId={tokenId || ""}
        gameAlreadyStarted={gameStarted}
        tokenConfig={token ? {
          settingsId: token.settingsId || undefined,
          objectiveId: token.objectiveId || undefined,
          playerName: token.playerName || undefined,
          soulbound: token.soulbound,
        } : undefined}
      />
    </Box>
  );
}
