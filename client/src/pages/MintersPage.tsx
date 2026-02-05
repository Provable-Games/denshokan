import { Box, Typography } from "@mui/material";
import { useMinterList } from "../hooks/useMinterList";
import MinterGrid from "../components/minters/MinterGrid";
import LoadingSpinner from "../components/common/LoadingSpinner";
import EmptyState from "../components/common/EmptyState";

export default function MintersPage() {
  const { minters, loading } = useMinterList();

  return (
    <Box>
      <Typography variant="h3" gutterBottom>
        Minters
      </Typography>
      {loading ? (
        <LoadingSpinner message="Loading minters..." />
      ) : minters.length === 0 ? (
        <EmptyState title="No minters found" description="Minters will appear here once registered." />
      ) : (
        <MinterGrid minters={minters} />
      )}
    </Box>
  );
}
