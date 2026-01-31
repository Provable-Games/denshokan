import { Card, CardContent, CardActionArea, Typography, Chip, Box } from "@mui/material";
import { useNavigate } from "react-router-dom";

interface Props {
  game: {
    gameId: number;
    name: string | null;
    description: string | null;
    imageUrl: string | null;
    contractAddress: string;
  };
}

export default function GameCard({ game }: Props) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardActionArea onClick={() => navigate(`/games/${game.gameId}`)}>
        {game.imageUrl && (
          <Box
            component="img"
            src={game.imageUrl}
            alt={game.name || "Game"}
            sx={{ width: "100%", height: 160, objectFit: "cover" }}
          />
        )}
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {game.name || `Game #${game.gameId}`}
          </Typography>
          {game.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {game.description}
            </Typography>
          )}
          <Chip label={`ID: ${game.gameId}`} size="small" variant="outlined" />
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
