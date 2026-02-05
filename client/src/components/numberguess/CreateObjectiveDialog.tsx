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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { CreateObjectiveParams } from "../../hooks/useNumberGuessConfig";

const OBJECTIVE_TYPES = [
  {
    value: 1,
    label: "Win",
    description: "Complete any game successfully",
    needsThreshold: false,
  },
  {
    value: 2,
    label: "Win Within N Guesses",
    description: "Win with a limited number of guesses",
    needsThreshold: true,
  },
  {
    value: 3,
    label: "Perfect Game",
    description: "Win on the first guess",
    needsThreshold: false,
  },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (params: CreateObjectiveParams) => Promise<number | null>;
  isLoading?: boolean;
  error?: string | null;
}

export default function CreateObjectiveDialog({
  open,
  onClose,
  onSubmit,
  isLoading,
  error,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objectiveType, setObjectiveType] = useState<1 | 2 | 3>(1);
  const [threshold, setThreshold] = useState(5);
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedType = OBJECTIVE_TYPES.find((t) => t.value === objectiveType);

  const handleSubmit = async () => {
    // Validate
    if (!name.trim()) {
      setValidationError("Name is required");
      return;
    }
    if (objectiveType === 2 && threshold < 1) {
      setValidationError("Threshold must be at least 1");
      return;
    }

    setValidationError(null);

    const result = await onSubmit({
      name: name.trim(),
      description: description.trim() || selectedType?.description || "",
      objectiveType,
      threshold: objectiveType === 2 ? threshold : 1,
    });

    if (result !== null) {
      // Success - reset form and close
      setName("");
      setDescription("");
      setObjectiveType(1);
      setThreshold(5);
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
      <DialogTitle>Create Custom Objective</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {(validationError || error) && (
            <Alert severity="error">{validationError || error}</Alert>
          )}

          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Speed Demon"
            fullWidth
            disabled={isLoading}
          />

          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Win a game in record time"
            fullWidth
            multiline
            rows={2}
            disabled={isLoading}
          />

          <FormControl fullWidth disabled={isLoading}>
            <InputLabel>Objective Type</InputLabel>
            <Select
              value={objectiveType}
              label="Objective Type"
              onChange={(e) => setObjectiveType(e.target.value as 1 | 2 | 3)}
            >
              {OBJECTIVE_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedType && (
            <Typography variant="body2" color="text.secondary">
              {selectedType.description}
            </Typography>
          )}

          {objectiveType === 2 && (
            <TextField
              label="Max Guesses Threshold"
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value) || 1)}
              inputProps={{ min: 1 }}
              helperText="Player must win with this many guesses or fewer"
              fullWidth
              disabled={isLoading}
            />
          )}

          <Box sx={{ p: 2, bgcolor: "background.default", borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Preview
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>{name || "Unnamed Objective"}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {objectiveType === 1 && "Awarded when player wins any game"}
              {objectiveType === 2 &&
                `Awarded when player wins in ${threshold} or fewer guesses`}
              {objectiveType === 3 &&
                "Awarded when player wins on their first guess"}
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
          {isLoading ? "Creating..." : "Create Objective"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
