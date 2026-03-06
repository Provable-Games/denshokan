import { Box, Typography } from "@mui/material";

interface Props {
  size?: number;
}

export default function LiveIndicator({ size = 6 }: Props) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: "50%",
          bgcolor: "success.main",
          animation: "live-pulse 2s infinite",
          "@keyframes live-pulse": {
            "0%, 100%": { opacity: 1 },
            "50%": { opacity: 0.4 },
          },
        }}
      />
      <Typography variant="caption" color="success.main">
        Live
      </Typography>
    </Box>
  );
}
