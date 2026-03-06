import { Grid } from "@mui/material";
import { motion } from "framer-motion";
import GameCard from "./GameCard";

interface Props {
  games: any[];
}

export default function GameGrid({ games }: Props) {
  return (
    <Grid container spacing={3}>
      {games.map((game, i) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={game.gameId}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <GameCard game={game} />
          </motion.div>
        </Grid>
      ))}
    </Grid>
  );
}
