import { Box, Typography } from "@mui/material";
import { useObjectives } from "@provable-games/denshokan-sdk/react";
import ObjectiveGrid from "../components/objectives/ObjectiveGrid";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

export default function ObjectivesPage() {
  const { data: objectivesData, isLoading: loading } = useObjectives();
  const objectives = objectivesData?.data ?? [];

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        Objectives
      </Typography>
      {loading ? (
        <LoadingSpinner message="Loading objectives..." />
      ) : objectives.length === 0 ? (
        <EmptyState title="No objectives found" description="Objectives will appear here once created." />
      ) : (
        <ObjectiveGrid objectives={objectives} />
      )}
    </Box>
  );
}
