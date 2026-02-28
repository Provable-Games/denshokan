import { useState } from "react";
import { AppBar, Toolbar, Typography, Button, Box, Menu, MenuItem, Chip } from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import WalletButton from "./WalletButton";
import { useChainConfig } from "../contexts/NetworkContext";
import { useSwitchNetwork } from "../hooks/useSwitchNetwork";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Games", path: "/games" },
  { label: "Minters", path: "/minters" },
  { label: "Settings", path: "/settings" },
  { label: "Objectives", path: "/objectives" },
  { label: "Mint", path: "/mint" },
  { label: "Game Tokens", path: "/portfolio" },
];

function NetworkSelector() {
  const { status } = useAccount();
  const { chainConfig, isMainnet } = useChainConfig();
  const { switchToMainnet, switchToSepolia } = useSwitchNetwork();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  if (status !== "connected") return null;

  return (
    <>
      <Chip
        label={chainConfig.networkName}
        size="small"
        color={isMainnet ? "success" : "warning"}
        variant="outlined"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ cursor: "pointer", mr: 1, textTransform: "capitalize" }}
      />
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem
          selected={isMainnet}
          onClick={() => {
            switchToMainnet();
            setAnchorEl(null);
          }}
        >
          Mainnet
        </MenuItem>
        <MenuItem
          selected={!isMainnet}
          onClick={() => {
            switchToSepolia();
            setAnchorEl(null);
          }}
        >
          Sepolia
        </MenuItem>
      </Menu>
    </>
  );
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.default", zIndex: (theme) => theme.zIndex.appBar }}>
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
        <NetworkSelector />
        <WalletButton />
      </Toolbar>
    </AppBar>
  );
}
