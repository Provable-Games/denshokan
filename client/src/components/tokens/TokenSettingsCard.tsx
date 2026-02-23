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
import SettingsIcon from "@mui/icons-material/Settings";
import type { ClientSetting } from "../../hooks/useSettingsList";

interface Props {
  setting: ClientSetting;
}

export default function TokenSettingsCard({ setting }: Props) {
  const entries = Object.entries(setting.settings);

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <SettingsIcon fontSize="small" color="primary" />
          <Typography variant="overline" color="text.secondary">
            Settings
          </Typography>
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {setting.name || `Settings #${setting.settingsId}`}
        </Typography>
        {setting.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, mb: 1 }}
          >
            {setting.description}
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
