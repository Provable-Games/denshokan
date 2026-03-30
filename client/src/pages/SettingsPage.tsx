import { Box, Typography } from "@mui/material";
import { useSettings } from "@provable-games/denshokan-sdk/react";
import SettingGrid from "../components/settings/SettingGrid";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

export default function SettingsPage() {
  const { data: settingsData, isLoading: loading } = useSettings();
  const settings = settingsData?.data ?? [];

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
