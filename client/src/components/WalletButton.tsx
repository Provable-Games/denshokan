import { useState, MouseEvent } from "react";
import { Button, Typography, Box, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import { useController } from "../contexts/ControllerContext";

export default function WalletButton() {
  const { isConnected, isPending, address, connectors, login, logout } = useController();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleOpen = (e: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  if (isPending) {
    return <Button disabled variant="outlined" size="small">Connecting...</Button>;
  }

  if (isConnected && address) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" sx={{ opacity: 0.7 }}>
          {address.slice(0, 6)}...{address.slice(-4)}
        </Typography>
        <Button variant="outlined" size="small" onClick={logout}>
          Disconnect
        </Button>
      </Box>
    );
  }

  return (
    <>
      <Button variant="contained" size="small" onClick={handleOpen}>
        Connect Wallet
      </Button>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        {connectors.map((connector) => (
          <MenuItem
            key={connector.name}
            onClick={() => {
              login(connector);
              handleClose();
            }}
          >
            {connector.icon && (
              <ListItemIcon>
                <img src={connector.icon} alt={connector.name} width={24} height={24} />
              </ListItemIcon>
            )}
            <ListItemText>{connector.name}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
