import { Card, CardContent, CardActionArea, Typography, Chip, Stack } from "@mui/material";
import { useNavigate } from "react-router-dom";

interface Props {
  token: {
    tokenId: string;
    gameId: number;
    ownerAddress: string;
    playerName: string | null;
    currentScore: string;
    gameOver: boolean;
    soulbound: boolean;
  };
}

export default function TokenCard({ token }: Props) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardActionArea onClick={() => navigate(`/tokens/${token.tokenId}`)}>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary">
            Game #{token.gameId}
          </Typography>
          <Typography variant="h6" gutterBottom>
            {token.playerName || `Token #${token.tokenId.slice(0, 8)}...`}
          </Typography>
          <Typography variant="h5" sx={{ mb: 1 }}>
            Score: {Number(token.currentScore).toLocaleString()}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip
              label={token.gameOver ? "Completed" : "Active"}
              color={token.gameOver ? "success" : "primary"}
              size="small"
            />
            {token.soulbound && <Chip label="Soulbound" size="small" variant="outlined" />}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
