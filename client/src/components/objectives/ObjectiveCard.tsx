import { Card, CardContent, Typography, Chip, Box } from "@mui/material";

interface Props {
  objective: {
    gameAddress: string;
    id: number;
    creatorAddress: string;
    name: string;
    description: string;
    objectives: Record<string, string>;
    blockNumber: string;
  };
  index: number;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function ObjectiveCard({ objective, index }: Props) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {objective.name || `Objective #${index + 1}`}
        </Typography>
        {objective.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {objective.description}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Game: {truncateAddress(objective.gameAddress)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Creator: {truncateAddress(objective.creatorAddress)}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
          <Chip label={`ID: ${objective.id}`} size="small" variant="outlined" />
          <Chip label={`Block: ${objective.blockNumber}`} size="small" variant="outlined" />
        </Box>
        {Object.keys(objective.objectives).length > 0 && (
          <Box sx={{ mt: 1 }}>
            {Object.entries(objective.objectives).map(([key, value]) => (
              <Typography key={key} variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {key}: {value}
              </Typography>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
