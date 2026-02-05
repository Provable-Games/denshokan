import { AppBar, Toolbar, Typography, Button, Box } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import WalletButton from "./WalletButton";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Games", path: "/games" },
  { label: "Minters", path: "/minters" },
  { label: "Mint", path: "/mint" },
  { label: "Game Tokens", path: "/portfolio" },
];

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Toolbar>
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, cursor: "pointer", mr: 4 }}
          onClick={() => navigate("/")}
        >
          Fun Factory
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flex: 1 }}>
          {navItems.map((item) => (
            <Button
              key={item.path}
              onClick={() => navigate(item.path)}
              sx={{
                color: location.pathname === item.path ? "primary.main" : "text.secondary",
              }}
            >
              {item.label}
            </Button>
          ))}
        </Box>
        <WalletButton />
      </Toolbar>
    </AppBar>
  );
}
