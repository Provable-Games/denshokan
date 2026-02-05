import { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  Divider,
  Alert,
} from "@mui/material";
import { Add, Settings, EmojiEvents } from "@mui/icons-material";
import { useNumberGuessConfig } from "../../hooks/useNumberGuessConfig";
import CreateSettingsDialog from "./CreateSettingsDialog";
import CreateObjectiveDialog from "./CreateObjectiveDialog";

interface Props {
  gameAddress: string;
  gameName?: string;
}

export default function GameConfigSection({ gameAddress, gameName }: Props) {
  const [showCreateSettings, setShowCreateSettings] = useState(false);
  const [showCreateObjective, setShowCreateObjective] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    createSettings,
    createObjective,
    settingsCount,
    objectiveCount,
    isCreatingSettings,
    isCreatingObjective,
    error,
    refetch,
  } = useNumberGuessConfig(gameAddress);

  const handleCreateSettings = async (params: Parameters<typeof createSettings>[0]) => {
    const newId = await createSettings(params);
    if (newId) {
      setSuccessMessage(`Settings "${params.name}" created with ID ${newId}`);
      setTimeout(() => setSuccessMessage(null), 5000);
      refetch();
    }
    return newId;
  };

  const handleCreateObjective = async (params: Parameters<typeof createObjective>[0]) => {
    const newId = await createObjective(params);
    if (newId) {
      setSuccessMessage(`Objective "${params.name}" created with ID ${newId}`);
      setTimeout(() => setSuccessMessage(null), 5000);
      refetch();
    }
    return newId;
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Game Configuration
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Create custom difficulty settings and objectives for {gameName || "this game"}.
        Anyone can create new configurations that all players can use.
      </Typography>

      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Settings Section */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <Settings color="primary" />
                <Typography variant="h6">Difficulty Settings</Typography>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Define custom number ranges and attempt limits for players to choose from.
              </Typography>

              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="body1">
                  <strong>{settingsCount}</strong> settings available
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ bgcolor: "background.default", p: 2, borderRadius: 1, mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Default Settings:</Typography>
                <Typography variant="body2" color="text.secondary">
                  1. Easy (1-10, unlimited)<br />
                  2. Medium (1-100, 10 attempts)<br />
                  3. Hard (1-1000, 10 attempts)
                </Typography>
              </Box>

              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setShowCreateSettings(true)}
                fullWidth
              >
                Create Custom Settings
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Objectives Section */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <EmojiEvents color="primary" />
                <Typography variant="h6">Objectives</Typography>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Create achievements that players can earn during gameplay.
              </Typography>

              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="body1">
                  <strong>{objectiveCount}</strong> objectives available
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ bgcolor: "background.default", p: 2, borderRadius: 1, mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Default Objectives:</Typography>
                <Typography variant="body2" color="text.secondary">
                  1. First Win - Win any game<br />
                  2. Quick Thinker - Win in 5 or fewer guesses<br />
                  3. Lucky Guess - Win on first guess
                </Typography>
              </Box>

              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setShowCreateObjective(true)}
                fullWidth
              >
                Create Custom Objective
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Dialogs */}
      <CreateSettingsDialog
        open={showCreateSettings}
        onClose={() => setShowCreateSettings(false)}
        onSubmit={handleCreateSettings}
        isLoading={isCreatingSettings}
        error={error}
      />

      <CreateObjectiveDialog
        open={showCreateObjective}
        onClose={() => setShowCreateObjective(false)}
        onSubmit={handleCreateObjective}
        isLoading={isCreatingObjective}
        error={error}
      />
    </Paper>
  );
}
