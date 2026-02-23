import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#7C4DFF",
      light: "#B47CFF",
      dark: "#3F1DCB",
    },
    secondary: {
      main: "#FF6D00",
      light: "#FF9E40",
      dark: "#C43E00",
    },
    background: {
      default: "#0a0a0a",
      paper: "#141414",
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(20, 20, 20, 0.8)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(124, 77, 255, 0.12)",
          transition: "border-color 0.3s ease, box-shadow 0.3s ease",
          "&:hover": {
            borderColor: "rgba(124, 77, 255, 0.3)",
            boxShadow: "0 0 20px rgba(124, 77, 255, 0.08)",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
        outlined: {
          borderColor: "rgba(124, 77, 255, 0.25)",
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: "rgba(124, 77, 255, 0.12)",
        },
      },
    },
  },
});
