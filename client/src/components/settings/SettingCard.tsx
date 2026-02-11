import { Card, CardContent, Typography, Chip, Box } from "@mui/material";

interface Props {
  setting: {
    gameAddress: string;
    settingsId: number;
    creatorAddress: string;
    name: string;
    description: string;
    settings: Record<string, string>;
    blockNumber: string;
  };
  index: number;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function SettingCard({ setting, index }: Props) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {setting.name || `Settings #${index + 1}`}
        </Typography>
        {setting.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {setting.description}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Game: {truncateAddress(setting.gameAddress)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Creator: {truncateAddress(setting.creatorAddress)}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
          <Chip label={`ID: ${setting.settingsId}`} size="small" variant="outlined" />
          <Chip label={`Block: ${setting.blockNumber}`} size="small" variant="outlined" />
        </Box>
        {Object.keys(setting.settings).length > 0 && (
          <Box sx={{ mt: 1 }}>
            {Object.entries(setting.settings).map(([key, value]) => (
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
