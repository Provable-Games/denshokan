import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { SnackbarProvider } from "notistack";
import { BrowserRouter } from "react-router-dom";
import { theme } from "./theme";
import { StarknetProvider } from "./contexts/StarknetProvider";
import { NetworkProvider } from "./contexts/NetworkContext";
import { DenshokanProviderWrapper } from "./contexts/DenshokanProviderWrapper";
import { ControllerProvider } from "./contexts/ControllerContext";
import ErrorBoundary from "./components/common/ErrorBoundary";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <SnackbarProvider maxSnack={3}>
          <StarknetProvider>
            <NetworkProvider>
              <DenshokanProviderWrapper>
                <ControllerProvider>
                  <BrowserRouter>
                    <ErrorBoundary>
                      <App />
                    </ErrorBoundary>
                  </BrowserRouter>
                </ControllerProvider>
              </DenshokanProviderWrapper>
            </NetworkProvider>
          </StarknetProvider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
