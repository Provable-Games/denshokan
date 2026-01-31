import { useState } from "react";
import { Box, Typography, Alert } from "@mui/material";
import MintForm from "../components/mint/MintForm";
import { useController } from "../contexts/ControllerContext";

export default function MintTokenPage() {
  const { isConnected } = useController();
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleMint = async (gameId: number) => {
    setMinting(true);
    setError(null);
    setSuccess(false);
    try {
      // Mint integration will be wired up in the contract integration phase
      console.log("Minting for game:", gameId);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || "Minting failed");
    } finally {
      setMinting(false);
    }
  };

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        Mint Game Token
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Select a game and mint a new token to start playing.
      </Typography>
      {success && <Alert severity="success" sx={{ mb: 2 }}>Token minted successfully!</Alert>}
      <MintForm onMint={handleMint} minting={minting} error={error} />
    </Box>
  );
}
