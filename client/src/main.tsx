import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { SnackbarProvider } from "notistack";
import { BrowserRouter } from "react-router-dom";
import { theme } from "./theme";
import { StarknetProvider } from "./contexts/StarknetProvider";
import { ControllerProvider } from "./contexts/ControllerContext";
import ErrorBoundary from "./components/common/ErrorBoundary";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider maxSnack={3}>
        <StarknetProvider>
          <ControllerProvider>
            <BrowserRouter>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </BrowserRouter>
          </ControllerProvider>
        </StarknetProvider>
      </SnackbarProvider>
    </ThemeProvider>
  </React.StrictMode>
);
