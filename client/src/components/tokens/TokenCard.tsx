import {
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Chip,
  Stack,
  Box,
} from "@mui/material";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import TokenImage from "./TokenImage";

interface Props {
  token: {
    tokenId: string;
    gameId: number;
    ownerAddress: string;
    playerName: string | null;
    currentScore: string;
    gameOver: boolean;
    soulbound: boolean;
    settingsId?: number;
    mintedAt?: string;
    tokenUri?: string;
  };
  variant?: "full" | "image";
}

export default function TokenCard({ token, variant = "full" }: Props) {
  const navigate = useNavigate();
  const statusColor = token.gameOver ? "success" : "primary";

  if (variant === "image") {
    return (
      <motion.div
        whileHover={{ scale: 1.03 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <Card
          sx={{
            overflow: "hidden",
            borderRadius: 2,
            cursor: "pointer",
          }}
        >
          <CardActionArea onClick={() => navigate(`/tokens/${token.tokenId}`)}>
            <Box sx={{ position: "relative", aspectRatio: "1" }}>
              <TokenImage
                tokenUri={token.tokenUri}
                alt={token.playerName || `Token ${token.tokenId}`}
                height="100%"
                objectFit="cover"
              />
              <Box
                sx={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  px: 1,
                  py: 0.5,
                  background:
                    "linear-gradient(transparent, rgba(0,0,0,0.7))",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: "white", fontWeight: 600, display: "block" }}
                  noWrap
                >
                  {token.playerName || `Game #${token.gameId}`}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Typography
                    variant="caption"
                    sx={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    {Number(token.currentScore).toLocaleString()}
                  </Typography>
                  <Chip
                    label={token.gameOver ? "Done" : "Live"}
                    color={statusColor}
                    size="small"
                    sx={{ height: 16, fontSize: "0.6rem" }}
                  />
                </Stack>
              </Box>
            </Box>
          </CardActionArea>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <Card sx={{ overflow: "hidden" }}>
        <Box
          sx={{
            height: 4,
            bgcolor: `${statusColor}.main`,
          }}
        />
        <CardActionArea onClick={() => navigate(`/tokens/${token.tokenId}`)}>
          <TokenImage
            tokenUri={token.tokenUri}
            alt={token.playerName || `Token ${token.tokenId}`}
            height={160}
          />
          <CardContent>
            <Typography variant="caption" color="text.secondary">
              Game #{token.gameId}
              {token.settingsId !== undefined &&
                ` / Settings #${token.settingsId}`}
            </Typography>

            <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 0.5 }}>
              {token.playerName || `Token #${token.tokenId.slice(0, 8)}...`}
            </Typography>

            <Typography variant="h4" sx={{ my: 1, fontWeight: 700 }}>
              {Number(token.currentScore).toLocaleString()}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 1 }}
            >
              Score
            </Typography>

            {token.mintedAt && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 1 }}
              >
                Minted {new Date(token.mintedAt).toLocaleDateString()}
              </Typography>
            )}

            <Stack direction="row" spacing={1}>
              <Chip
                label={token.gameOver ? "Completed" : "Active"}
                color={statusColor}
                size="small"
              />
              {token.soulbound && (
                <Chip label="Soulbound" size="small" variant="outlined" />
              )}
            </Stack>
          </CardContent>
        </CardActionArea>
      </Card>
    </motion.div>
  );
}
