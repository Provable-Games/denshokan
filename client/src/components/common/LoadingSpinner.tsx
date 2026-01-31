import { Box, CircularProgress, Typography } from "@mui/material";

export default function LoadingSpinner({ message }: { message?: string }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 8 }}>
      <CircularProgress />
      {message && <Typography sx={{ mt: 2, opacity: 0.7 }}>{message}</Typography>}
    </Box>
  );
}
