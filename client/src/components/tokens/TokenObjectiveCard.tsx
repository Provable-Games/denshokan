import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Box,
} from "@mui/material";
import FlagIcon from "@mui/icons-material/Flag";
import type { GameObjectiveDetails } from "@provable-games/denshokan-sdk";

interface Props {
  objective: GameObjectiveDetails;
}

export default function TokenObjectiveCard({ objective }: Props) {
  const entries = Object.entries(objective.objectives);

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <FlagIcon fontSize="small" color="primary" />
          <Typography variant="overline" color="text.secondary">
            Objective
          </Typography>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {objective.name || `Objective #${objective.id}`}
        </Typography>
        {objective.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, mb: 1 }}
          >
            {objective.description}
          </Typography>
        )}
        {entries.length > 0 && (
          <Table size="small" sx={{ mt: 1 }}>
            <TableBody>
              {entries.map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell
                    sx={{
                      color: "text.secondary",
                      fontWeight: 500,
                      borderColor: "rgba(124, 77, 255, 0.08)",
                      pl: 0,
                    }}
                  >
                    {key}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: "monospace",
                      borderColor: "rgba(124, 77, 255, 0.08)",
                      pr: 0,
                    }}
                  >
                    {value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
