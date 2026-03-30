import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Box,
} from "@mui/material";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import { useNavigate } from "react-router-dom";
import type { Game } from "@provable-games/denshokan-sdk";

interface Props {
  game: Game | null;
  gameId: number;
}

export default function TokenGameInfoCard({ game, gameId }: Props) {
  const navigate = useNavigate();

  return (
    <Card variant="outlined">
      <CardActionArea onClick={() => navigate(`/games/${gameId}`)}>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <SportsEsportsIcon fontSize="small" color="primary" />
            <Typography variant="overline" color="text.secondary">
              Game
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {game?.name || `Game #${gameId}`}
          </Typography>
          {game?.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5 }}
            >
              {game.description}
            </Typography>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
