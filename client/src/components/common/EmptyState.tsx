import { Box, Typography, Button } from "@mui/material";

interface Props {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ title, description, action }: Props) {
  return (
    <Box sx={{ textAlign: "center", py: 8 }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mb: 2 }}>{description}</Typography>}
      {action && <Button variant="contained" onClick={action.onClick}>{action.label}</Button>}
    </Box>
  );
}
