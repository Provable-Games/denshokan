import { useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Box } from "@mui/material";
import { useSnackbar } from "notistack";
import { useMintEvents } from "@provable-games/denshokan-sdk/react";
import type { MintEvent } from "@provable-games/denshokan-sdk";
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

export default function Layout() {
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <MintNotifications />
      <Box component="main" sx={{ flex: 1, p: 3 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
