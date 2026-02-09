import { Card, CardContent, Typography, Chip, Box } from "@mui/material";

interface Props {
  objective: {
    gameAddress: string;
    objectiveId: number;
    creatorAddress: string;
    objectiveData: string | null;
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
          Objective #{index + 1}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Game: {truncateAddress(objective.gameAddress)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Creator: {truncateAddress(objective.creatorAddress)}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Chip label={`ID: ${objective.objectiveId}`} size="small" variant="outlined" />
          <Chip label={`Block: ${objective.blockNumber}`} size="small" variant="outlined" />
        </Box>
        {objective.objectiveData && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            {objective.objectiveData.length > 60
              ? `${objective.objectiveData.slice(0, 60)}...`
              : objective.objectiveData}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
