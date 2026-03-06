import { ReactNode } from "react";
import { Box, Typography, Button } from "@mui/material";

interface Props {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  icon?: ReactNode;
}

export default function EmptyState({ title, description, action, icon }: Props) {
  return (
    <Box sx={{ textAlign: "center", py: 8 }}>
      {icon && (
        <Box sx={{ mb: 2, opacity: 0.4, "& .MuiSvgIcon-root": { fontSize: 64 } }}>
          {icon}
        </Box>
      )}
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mb: 2 }}>{description}</Typography>}
      {action && <Button variant="contained" onClick={action.onClick}>{action.label}</Button>}
    </Box>
  );
}
