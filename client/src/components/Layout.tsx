import { useCallback, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Box } from "@mui/material";
import { useSnackbar } from "notistack";
import { useMintEvents } from "@provable-games/denshokan-sdk/react";
import type { MintEvent } from "@provable-games/denshokan-sdk";
import { useNumberGuessWebSocket } from "../hooks/useNumberGuessWebSocket";
import type { WsGuessPayload, WsGameEndPayload } from "../hooks/numberGuessApi.types";
import { getDisplayName } from "../hooks/useCartridgeUsernames";
import Header from "./Header";

function MintNotifications() {
  const { enqueueSnackbar } = useSnackbar();

  useMintEvents({
    onEvent: useCallback((e: MintEvent) => {
      enqueueSnackbar(`New token minted in Game #${e.gameId}`, {
        variant: "info",
        autoHideDuration: 4000,
      });
    }, [enqueueSnackbar]),
  });

  return null;
}

const GUESS_COLORS = {
  too_low: { background: "#1a237e", border: "#42a5f5" },   // blue
  too_high: { background: "#4a148c", border: "#ce93d8" },   // purple
  correct: { background: "#1b5e20", border: "#66bb6a" },    // green
};

function GuessNotifications() {
  const { enqueueSnackbar } = useSnackbar();

  const { isConnected } = useNumberGuessWebSocket({
    channels: ["guess", "game_won", "game_lost"],
    onGuess: useCallback(
      async (data: WsGuessPayload) => {
        const player = data.player
          ? await getDisplayName(data.player)
          : `token ${data.tokenId.slice(0, 8)}...`;
        const label = data.result === "correct" ? "Correct!" : data.result === "too_low" ? "Too low" : "Too high";
        const colors = GUESS_COLORS[data.result];

        enqueueSnackbar(`${player} guessed ${data.guessValue} — ${label}`, {
          variant: "default",
          autoHideDuration: 3000,
          style: {
            background: colors.background,
            border: `1px solid ${colors.border}`,
            color: "#fff",
            fontWeight: 600,
          },
        });
      },
      [enqueueSnackbar],
    ),
    onGameWon: useCallback(
      (data: WsGameEndPayload) => {
        const tokenShort = data.tokenId.slice(0, 8) + "...";
        enqueueSnackbar(`Game won on ${tokenShort} in ${data.guessCount} guesses!`, {
          variant: "default",
          autoHideDuration: 5000,
          style: {
            background: GUESS_COLORS.correct.background,
            border: `1px solid ${GUESS_COLORS.correct.border}`,
            color: "#fff",
            fontWeight: 600,
          },
        });
      },
      [enqueueSnackbar],
    ),
    onGameLost: useCallback(
      (data: WsGameEndPayload) => {
        const tokenShort = data.tokenId.slice(0, 8) + "...";
        enqueueSnackbar(`Game lost on ${tokenShort} after ${data.guessCount} guesses`, {
          variant: "default",
          autoHideDuration: 5000,
          style: {
            background: "#b71c1c",
            border: "1px solid #ef5350",
            color: "#fff",
            fontWeight: 600,
          },
        });
      },
      [enqueueSnackbar],
    ),
  });

  useEffect(() => {
    console.log(`[GuessNotifications] WS connected: ${isConnected}`);
  }, [isConnected]);

  return null;
}

export default function Layout() {
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <MintNotifications />
      <GuessNotifications />
      <Box component="main" sx={{ flex: 1, p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
