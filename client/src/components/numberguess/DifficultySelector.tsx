import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Button,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import { motion } from "framer-motion";

interface DifficultyOption {
  id: number;
  name: string;
  description: string;
  min: number;
  max: number;
  maxAttempts: number;
}

const DEFAULT_DIFFICULTIES: DifficultyOption[] = [
  {
    id: 1,
    name: "Easy",
    description: "Guess a number between 1 and 10",
    min: 1,
    max: 10,
    maxAttempts: 0, // Unlimited
  },
  {
    id: 2,
    name: "Medium",
    description: "Guess a number between 1 and 100",
    min: 1,
    max: 100,
    maxAttempts: 10,
  },
  {
    id: 3,
    name: "Hard",
    description: "Guess a number between 1 and 1000",
    min: 1,
    max: 1000,
    maxAttempts: 10,
  },
];

interface Props {
  onSelect: (settingsId: number) => void;
  onCreateCustom?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export default function DifficultySelector({
  onSelect,
  onCreateCustom,
  isLoading,
  disabled,
}: Props) {
  return (
    <Box>
      <Typography variant="h5" gutterBottom align="center" sx={{ mb: 3 }}>
        Select Difficulty
      </Typography>
      <Grid container spacing={2} justifyContent="center">
        {DEFAULT_DIFFICULTIES.map((diff, index) => (
          <Grid size={{ xs: 12, sm: 4 }} key={diff.id}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                sx={{
                  height: "100%",
                  opacity: disabled || isLoading ? 0.6 : 1,
                  transition: "transform 0.2s, box-shadow 0.2s",
                  "&:hover": {
                    transform: disabled ? "none" : "translateY(-4px)",
                    boxShadow: disabled ? undefined : 6,
                  },
                }}
              >
                <CardActionArea
                  onClick={() => onSelect(diff.id)}
                  disabled={disabled || isLoading}
                  sx={{ height: "100%", p: 1 }}
                >
                  <CardContent>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                      }}
                    >
                      <Typography variant="h6">{diff.name}</Typography>
                      {isLoading ? (
                        <CircularProgress size={20} />
                      ) : (
                        <Chip
                          label={`${diff.min}-${diff.max}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      )}
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 2 }}
                    >
                      {diff.description}
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        gap: 1,
                        flexWrap: "wrap",
                      }}
                    >
                      <Chip
                        label={`Range: ${diff.max - diff.min + 1}`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={
                          diff.maxAttempts === 0
                            ? "Unlimited"
                            : `${diff.maxAttempts} attempts`
                        }
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </motion.div>
          </Grid>
        ))}
      </Grid>

      {onCreateCustom && (
        <Box sx={{ mt: 3, textAlign: "center" }}>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={onCreateCustom}
            disabled={disabled || isLoading}
          >
            Create Custom Difficulty
          </Button>
        </Box>
      )}
    </Box>
  );
}
