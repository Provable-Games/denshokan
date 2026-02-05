import { Card, CardContent, Typography, Chip, Box } from "@mui/material";

interface Props {
  minter: {
    id: string;
    name: string | null;
    address: string;
    gameId: number;
    active: boolean;
  };
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function MinterCard({ minter }: Props) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {minter.name || `Minter #${minter.id}`}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {truncateAddress(minter.address)}
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Chip label={`Game: ${minter.gameId}`} size="small" variant="outlined" />
          <Chip
            label={minter.active ? "Active" : "Inactive"}
            size="small"
            color={minter.active ? "success" : "default"}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
