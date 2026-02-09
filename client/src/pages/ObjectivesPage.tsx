import { Box, Typography } from "@mui/material";
import { useObjectivesList } from "../hooks/useObjectivesList";
import ObjectiveGrid from "../components/objectives/ObjectiveGrid";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

export default function ObjectivesPage() {
  const { objectives, loading } = useObjectivesList();

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
