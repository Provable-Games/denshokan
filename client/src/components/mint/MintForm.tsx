import { useState } from "react";
import { Box, Button, FormControl, InputLabel, Select, MenuItem, Typography, Alert } from "@mui/material";
import { useGameList } from "../../hooks/useGameList";
import { useController } from "../../contexts/ControllerContext";

interface Props {
  onMint: (gameId: number) => void;
  minting: boolean;
  error: string | null;
}

export default function MintForm({ onMint, minting, error }: Props) {
  const { games } = useGameList();
  const { isConnected } = useController();
  const [selectedGame, setSelectedGame] = useState<number | "">("");

  return (
    <Box sx={{ maxWidth: 480 }}>
      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel>Select Game</InputLabel>
        <Select
          value={selectedGame}
          label="Select Game"
          onChange={(e) => setSelectedGame(e.target.value as number)}
        >
          {games.map((g) => (
            <MenuItem key={g.gameId} value={g.gameId}>
              {g.name || `Game #${g.gameId}`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Button
        variant="contained"
        size="large"
        fullWidth
        disabled={!isConnected || !selectedGame || minting}
        onClick={() => selectedGame && onMint(selectedGame)}
      >
        {!isConnected ? "Connect Wallet to Mint" : minting ? "Minting..." : "Mint Token"}
      </Button>

      {!isConnected && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: "center" }}>
          Connect your wallet to mint game tokens
        </Typography>
      )}
    </Box>
  );
}
