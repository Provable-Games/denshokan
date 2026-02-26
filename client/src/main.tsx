import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { SnackbarProvider } from "notistack";
import { BrowserRouter } from "react-router-dom";
import { DenshokanProvider } from "@provable-games/denshokan-sdk/react";
import { theme } from "./theme";
import { StarknetProvider } from "./contexts/StarknetProvider";
import { ControllerProvider } from "./contexts/ControllerContext";
import ErrorBoundary from "./components/common/ErrorBoundary";
import App from "./App";
import { config, networkName } from "./config";

const denshokanConfig = {
  chain: networkName as "mainnet" | "sepolia",
  apiUrl: config.apiUrl,
  rpcUrl: config.rpcUrl,
  denshokanAddress: config.denshokanAddress,
  registryAddress: config.registryAddress,
  viewerAddress: config.viewerAddress,
  primarySource: "api" as const,
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <SnackbarProvider maxSnack={3}>
          <StarknetProvider>
            <DenshokanProvider config={denshokanConfig}>
              <ControllerProvider>
                <BrowserRouter>
                  <ErrorBoundary>
                    <App />
                  </ErrorBoundary>
                </BrowserRouter>
              </ControllerProvider>
            </DenshokanProvider>
          </StarknetProvider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
