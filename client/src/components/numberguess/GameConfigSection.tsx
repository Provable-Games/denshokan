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
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
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
    settings,
    objectives,
    settingsCount,
    objectiveCount,
    isCreatingSettings,
    isCreatingObjective,
    isLoadingSettings,
    isLoadingObjectives,
    error,
    refetch,
  } = useNumberGuessConfig(gameAddress);

  const getObjectiveTypeLabel = (type: number) => {
    switch (type) {
      case 1: return "Win";
      case 2: return "Win Within N";
      case 3: return "Perfect Game";
      default: return `Type ${type}`;
    }
  };

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

              {isLoadingSettings ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <List dense sx={{ bgcolor: "background.default", borderRadius: 1, mb: 2, maxHeight: 200, overflow: "auto" }}>
                  {settings.map((s) => (
                    <ListItem key={s.id} sx={{ py: 0.5 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography variant="body2" fontWeight="medium">
                              {s.id}. {s.name}
                            </Typography>
                            {s.id <= 3 && (
                              <Chip label="Default" size="small" variant="outlined" sx={{ height: 18, fontSize: "0.7rem" }} />
                            )}
                          </Box>
                        }
                        secondary={`Range: ${s.min}-${s.max}, ${s.maxAttempts === 0 ? "Unlimited" : `${s.maxAttempts} attempts`}`}
                      />
                    </ListItem>
                  ))}
                  {settings.length === 0 && (
                    <ListItem>
                      <ListItemText secondary="No settings available" />
                    </ListItem>
                  )}
                </List>
              )}

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

              {isLoadingObjectives ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <List dense sx={{ bgcolor: "background.default", borderRadius: 1, mb: 2, maxHeight: 200, overflow: "auto" }}>
                  {objectives.map((o) => (
                    <ListItem key={o.id} sx={{ py: 0.5 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography variant="body2" fontWeight="medium">
                              {o.id}. {o.name}
                            </Typography>
                            {o.id <= 3 && (
                              <Chip label="Default" size="small" variant="outlined" sx={{ height: 18, fontSize: "0.7rem" }} />
                            )}
                          </Box>
                        }
                        secondary={
                          <>
                            {o.description}
                            {o.objectiveType === 2 && ` (${o.threshold} guesses)`}
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                  {objectives.length === 0 && (
                    <ListItem>
                      <ListItemText secondary="No objectives available" />
                    </ListItem>
                  )}
                </List>
              )}

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
