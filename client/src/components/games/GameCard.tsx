import { Card, CardContent, CardActionArea, Typography, Chip, Box } from "@mui/material";
import { SportsEsports } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

const GAME_IMAGE_OVERRIDES: Record<string, string> = {
  "Number Guess": "/number-guess.png",
  "Tic Tac Toe": "/tic-tac-toe.png",
};

interface Props {
  game: {
    gameId: number;
    name?: string;
    description?: string;
    imageUrl?: string;
    contractAddress: string;
  };
}

export default function GameCard({ game }: Props) {
  const navigate = useNavigate();
  const imageUrl = (game.name && GAME_IMAGE_OVERRIDES[game.name]) || game.imageUrl || null;

  return (
    <Card>
      <CardActionArea onClick={() => navigate(`/games/${game.gameId}`)}>
        {imageUrl ? (
          <Box
            component="img"
            src={imageUrl}
            alt={game.name || "Game"}
            sx={{ width: "100%", height: 160, objectFit: "cover" }}
          />
        ) : (
          <Box
            sx={{
              width: "100%",
              height: 160,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, rgba(124,77,255,0.15) 0%, rgba(255,158,64,0.10) 100%)",
            }}
          >
            <SportsEsports sx={{ fontSize: 48, opacity: 0.3 }} />
          </Box>
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
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            <Chip label={`ID: ${game.gameId}`} size="small" variant="outlined" />
            <Chip
              label={`${game.contractAddress.slice(0, 6)}...${game.contractAddress.slice(-4)}`}
              size="small"
              variant="outlined"
              sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
            />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
