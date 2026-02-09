import { Box, Typography } from "@mui/material";
import { useSettingsList } from "../hooks/useSettingsList";
import SettingGrid from "../components/settings/SettingGrid";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

export default function SettingsPage() {
  const { settings, loading } = useSettingsList();

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        Settings
      </Typography>
      {loading ? (
        <LoadingSpinner message="Loading settings..." />
      ) : settings.length === 0 ? (
        <EmptyState title="No settings found" description="Settings will appear here once created." />
      ) : (
        <SettingGrid settings={settings} />
      )}
    </Box>
  );
}
