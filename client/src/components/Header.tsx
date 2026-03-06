import { useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Menu,
  MenuItem,
  Chip,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import MoreVert from "@mui/icons-material/MoreVert";
import { useNavigate, useLocation } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import WalletButton from "./WalletButton";
import { useChainConfig } from "../contexts/NetworkContext";
import { useSwitchNetwork } from "../hooks/useSwitchNetwork";

const primaryNavItems = [
  { label: "Home", path: "/" },
  { label: "Games", path: "/games" },
  { label: "Mint", path: "/mint" },
  { label: "My Tokens", path: "/portfolio" },
];

const secondaryNavItems = [
  { label: "Minters", path: "/minters" },
  { label: "Settings", path: "/settings" },
  { label: "Objectives", path: "/objectives" },
];

const allNavItems = [...primaryNavItems, ...secondaryNavItems];

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreAnchorEl, setMoreAnchorEl] = useState<null | HTMLElement>(null);

  const handleNavClick = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
    setMoreAnchorEl(null);
  };

  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.default",
        zIndex: (theme) => theme.zIndex.appBar,
      }}
    >
      <Toolbar>
        {/* Mobile hamburger */}
        <IconButton
          edge="start"
          aria-label="open navigation menu"
          onClick={() => setDrawerOpen(true)}
          sx={{ display: { xs: "flex", md: "none" }, mr: 1 }}
        >
          <MenuIcon />
        </IconButton>

        {/* Brand */}
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, cursor: "pointer", mr: 4 }}
          onClick={() => navigate("/")}
        >
          Fun Factory
        </Typography>

        {/* Desktop nav */}
        <Box sx={{ display: { xs: "none", md: "flex" }, gap: 1, flex: 1 }}>
          {primaryNavItems.map((item) => (
            <Button
              key={item.path}
              onClick={() => handleNavClick(item.path)}
              sx={{
                color:
                  location.pathname === item.path
                    ? "primary.main"
                    : "text.secondary",
              }}
            >
              {item.label}
            </Button>
          ))}

          {/* More dropdown for secondary items */}
          <IconButton
            aria-label="more navigation options"
            onClick={(e) => setMoreAnchorEl(e.currentTarget)}
            size="small"
            sx={{
              color: secondaryNavItems.some(
                (item) => location.pathname === item.path
              )
                ? "primary.main"
                : "text.secondary",
            }}
          >
            <MoreVert />
          </IconButton>
          <Menu
            anchorEl={moreAnchorEl}
            open={Boolean(moreAnchorEl)}
            onClose={() => setMoreAnchorEl(null)}
          >
            {secondaryNavItems.map((item) => (
              <MenuItem
                key={item.path}
                selected={location.pathname === item.path}
                onClick={() => handleNavClick(item.path)}
              >
                {item.label}
              </MenuItem>
            ))}
          </Menu>
        </Box>

        {/* Spacer on mobile */}
        <Box sx={{ flex: 1, display: { xs: "flex", md: "none" } }} />

        <NetworkSelector />
        <WalletButton />
      </Toolbar>

      {/* Mobile drawer */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        <Box sx={{ width: 250 }} role="navigation">
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, p: 2 }}
          >
            Fun Factory
          </Typography>
          <Divider />
          <List>
            {allNavItems.map((item) => (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => handleNavClick(item.path)}
                >
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
    </AppBar>
  );
}
