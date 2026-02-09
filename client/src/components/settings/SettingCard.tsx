import { Card, CardContent, Typography, Chip, Box } from "@mui/material";

interface Props {
  setting: {
    gameAddress: string;
    settingsId: number;
    creatorAddress: string;
    settingsData: string | null;
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
          Settings #{index + 1}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Game: {truncateAddress(setting.gameAddress)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Creator: {truncateAddress(setting.creatorAddress)}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Chip label={`ID: ${setting.settingsId}`} size="small" variant="outlined" />
          <Chip label={`Block: ${setting.blockNumber}`} size="small" variant="outlined" />
        </Box>
        {setting.settingsData && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            {setting.settingsData.length > 60
              ? `${setting.settingsData.slice(0, 60)}...`
              : setting.settingsData}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
