import { Grid } from "@mui/material";
import GameCard from "./GameCard";

interface Props {
  games: any[];
}

export default function GameGrid({ games }: Props) {
  return (
    <Grid container spacing={3}>
      {games.map((game) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={game.gameId}>
          <GameCard game={game} />
        </Grid>
      ))}
    </Grid>
  );
}
