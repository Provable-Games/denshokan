import { Card, CardContent, Typography, Box } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import LiveIndicator from "../common/LiveIndicator";

interface Props {
  score: number;
  isLive: boolean;
  isGameOver: boolean;
}

export default function TokenScoreCard({ score, isLive, isGameOver }: Props) {
  return (
    <Card
      variant="outlined"
      sx={{
        position: "relative",
        overflow: "hidden",
      }}
    >
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Typography color="text.secondary" variant="overline">
            Current Score
          </Typography>
          {isLive && <LiveIndicator />}
          {isGameOver && (
            <Typography variant="caption" color="warning.main">
              Final
            </Typography>
          )}
        </Box>
        <AnimatePresence mode="wait">
          <motion.div
            key={score}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <Typography variant="h2" sx={{ fontWeight: 700 }}>
              {score.toLocaleString()}
            </Typography>
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
