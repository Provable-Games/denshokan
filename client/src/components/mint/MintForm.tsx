import { useState, useEffect } from "react";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Alert,
  TextField,
  Switch,
  FormControlLabel,
  Divider,
  CircularProgress,
  ListItemText,
} from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useGameList } from "../../hooks/useGameList";
import { useController } from "../../contexts/ControllerContext";
import { useSettingsList } from "../../hooks/useSettingsList";
import { useObjectivesList } from "../../hooks/useObjectivesList";

export interface MintFormParams {
  gameAddress: string;
  playerName?: string;
  settingsId?: number;
  soulbound?: boolean;
  start?: number;
  end?: number;
  objectiveId?: number;
  clientUrl?: string;
}

interface Props {
  onMint: (params: MintFormParams) => void;
  minting: boolean;
  error: string | null;
}

export default function MintForm({ onMint, minting, error }: Props) {
  const { games } = useGameList();
  const { isConnected } = useController();

  const [selectedGame, setSelectedGame] = useState<string>("");
  const [playerName, setPlayerName] = useState("");
  const [soulbound, setSoulbound] = useState(false);
  const [settingsId, setSettingsId] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [objectiveId, setObjectiveId] = useState<string>("");
  const [clientUrl, setClientUrl] = useState("");

  // Fetch settings for selected game
  const { settings, loading: isLoadingSettings } = useSettingsList(
    selectedGame ? { gameAddress: selectedGame } : undefined,
  );

  // Fetch objectives for selected game, filtered by settings ID
  const { objectives, loading: isLoadingObjectives } = useObjectivesList(
    selectedGame
      ? {
          gameAddress: selectedGame,
          ...(settingsId ? { settingsId: Number(settingsId) } : {}),
        }
      : undefined,
  );

  // Reset settings and objective when game changes
  useEffect(() => {
    setSettingsId("");
    setObjectiveId("");
  }, [selectedGame]);

  // Reset objective when settings changes
  useEffect(() => {
    setObjectiveId("");
  }, [settingsId]);

  const handleSubmit = () => {
    if (!selectedGame) return;
    const params: MintFormParams = { gameAddress: selectedGame };
    if (playerName.trim()) params.playerName = playerName.trim();
    if (settingsId) params.settingsId = Number(settingsId);
    if (soulbound) params.soulbound = true;
    if (startTime) params.start = Number(startTime);
    if (endTime) params.end = Number(endTime);
    if (objectiveId) params.objectiveId = Number(objectiveId);
    if (clientUrl.trim()) params.clientUrl = clientUrl.trim();
    onMint(params);
  };

  return (
    <Box sx={{ maxWidth: 480 }}>
      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel>Select Game</InputLabel>
        <Select
          value={selectedGame}
          label="Select Game"
          onChange={(e) => setSelectedGame(e.target.value as string)}
        >
          {games.map((g) => (
            <MenuItem key={g.gameId} value={g.contractAddress}>
              {g.name || `Game #${g.gameId}`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        fullWidth
        label="Player Name"
        placeholder="Enter your name (optional)"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        sx={{ mb: 2 }}
      />

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={soulbound}
              onChange={(e) => setSoulbound(e.target.checked)}
            />
          }
          label="Soulbound"
        />
        <Typography variant="caption" color="text.secondary">
          Token cannot be transferred
        </Typography>
      </Box>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Settings</InputLabel>
        <Select
          value={settingsId}
          label="Settings"
          onChange={(e) => setSettingsId(e.target.value as string)}
          disabled={!selectedGame || isLoadingSettings}
          endAdornment={
            isLoadingSettings ? (
              <CircularProgress size={20} sx={{ mr: 2 }} />
            ) : undefined
          }
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {settings.map((s) => (
            <MenuItem key={s.settingsId} value={String(s.settingsId)}>
              <ListItemText
                primary={s.name || `Settings #${s.settingsId}`}
                secondary={s.description || undefined}
              />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Divider sx={{ my: 2 }} />

      <Button
        size="small"
        onClick={() => setShowAdvanced((v) => !v)}
        endIcon={
          <ExpandMoreIcon
            sx={{
              transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          />
        }
        sx={{ mb: 1, color: "text.secondary" }}
      >
        Advanced Options
      </Button>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                pt: 1,
                pb: 2,
              }}
            >
              <TextField
                fullWidth
                label="Start Time"
                type="number"
                placeholder="Unix timestamp (optional)"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <TextField
                fullWidth
                label="End Time"
                type="number"
                placeholder="Unix timestamp (optional)"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
              <FormControl fullWidth>
                <InputLabel>Objective</InputLabel>
                <Select
                  value={objectiveId}
                  label="Objective"
                  onChange={(e) => setObjectiveId(e.target.value as string)}
                  disabled={!selectedGame || isLoadingObjectives}
                  endAdornment={
                    isLoadingObjectives ? (
                      <CircularProgress size={20} sx={{ mr: 2 }} />
                    ) : undefined
                  }
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {objectives.map((o) => (
                    <MenuItem key={o.objectiveId} value={String(o.objectiveId)}>
                      <ListItemText
                        primary={o.name || `Objective #${o.objectiveId}`}
                        secondary={o.description || undefined}
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Client URL"
                placeholder="https://... (optional)"
                value={clientUrl}
                onChange={(e) => setClientUrl(e.target.value)}
              />
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        size="large"
        fullWidth
        disabled={!isConnected || !selectedGame || minting}
        onClick={handleSubmit}
      >
        {!isConnected
          ? "Connect Wallet to Mint"
          : minting
            ? "Minting..."
            : "Mint Token"}
      </Button>

      {!isConnected && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, textAlign: "center" }}
        >
          Connect your wallet to mint game tokens
        </Typography>
      )}
    </Box>
  );
}
