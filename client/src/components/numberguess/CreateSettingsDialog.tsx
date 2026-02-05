import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { CreateSettingsParams } from "../../hooks/useNumberGuessConfig";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (params: CreateSettingsParams) => Promise<number | null>;
  isLoading?: boolean;
  error?: string | null;
}

export default function CreateSettingsDialog({
  open,
  onClose,
  onSubmit,
  isLoading,
  error,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(100);
  const [maxAttempts, setMaxAttempts] = useState(10);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async () => {
    // Validate
    if (!name.trim()) {
      setValidationError("Name is required");
      return;
    }
    if (max <= min) {
      setValidationError("Max must be greater than min");
      return;
    }
    if (maxAttempts < 0) {
      setValidationError("Max attempts cannot be negative");
      return;
    }

    setValidationError(null);

    const result = await onSubmit({
      name: name.trim(),
      description: description.trim() || `Guess a number between ${min} and ${max}`,
      min,
      max,
      maxAttempts,
    });

    if (result !== null) {
      // Success - reset form and close
      setName("");
      setDescription("");
      setMin(1);
      setMax(100);
      setMaxAttempts(10);
      onClose();
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setValidationError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create Custom Difficulty</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {(validationError || error) && (
            <Alert severity="error">{validationError || error}</Alert>
          )}

          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Expert Mode"
            fullWidth
            disabled={isLoading}
          />

          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., For true number guessing masters"
            fullWidth
            multiline
            rows={2}
            disabled={isLoading}
          />

          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="Min"
              type="number"
              value={min}
              onChange={(e) => setMin(parseInt(e.target.value) || 1)}
              inputProps={{ min: 1 }}
              fullWidth
              disabled={isLoading}
            />
            <TextField
              label="Max"
              type="number"
              value={max}
              onChange={(e) => setMax(parseInt(e.target.value) || 100)}
              inputProps={{ min: 2 }}
              fullWidth
              disabled={isLoading}
            />
          </Box>

          <TextField
            label="Max Attempts"
            type="number"
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(parseInt(e.target.value) || 0)}
            inputProps={{ min: 0 }}
            helperText="Set to 0 for unlimited attempts"
            fullWidth
            disabled={isLoading}
          />

          <Box sx={{ p: 2, bgcolor: "background.default", borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Preview: Guess a number between {min} and {max}
              {maxAttempts > 0
                ? ` in ${maxAttempts} attempts`
                : " (unlimited attempts)"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Range size: {max - min + 1} numbers
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isLoading}
          startIcon={isLoading ? <CircularProgress size={20} /> : null}
        >
          {isLoading ? "Creating..." : "Create Settings"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
