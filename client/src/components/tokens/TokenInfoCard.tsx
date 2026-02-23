import {
  Card,
  CardContent,
  Typography,
  Box,
  Stack,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import TagIcon from "@mui/icons-material/Tag";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import type { ClientToken } from "../../hooks/useTokenDetail";

interface Props {
  token: ClientToken;
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
      <Box sx={{ color: "primary.main", display: "flex" }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            wordBreak: "break-all",
            fontFamily: "monospace",
            fontSize: "0.8rem",
          }}
        >
          {value}
        </Typography>
      </Box>
    </Box>
  );
}

function truncateAddress(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export default function TokenInfoCard({ token }: Props) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary" gutterBottom>
          Token Info
        </Typography>
        <Stack divider={<Box sx={{ borderBottom: 1, borderColor: "divider" }} />}>
          <InfoRow
            icon={<PersonIcon fontSize="small" />}
            label="Owner"
            value={truncateAddress(token.ownerAddress)}
          />
          <InfoRow
            icon={<AccessTimeIcon fontSize="small" />}
            label="Minted"
            value={new Date(token.mintedAt).toLocaleString()}
          />
          <InfoRow
            icon={<TagIcon fontSize="small" />}
            label="Token ID"
            value={truncateAddress(token.tokenId)}
          />
          {token.gameAddress && (
            <InfoRow
              icon={<SportsEsportsIcon fontSize="small" />}
              label="Game Address"
              value={truncateAddress(token.gameAddress)}
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
