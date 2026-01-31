import { Button, Typography, Box } from "@mui/material";
import { useController } from "../contexts/ControllerContext";

export default function WalletButton() {
  const { isConnected, isPending, address, login, logout } = useController();

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
    <Button variant="contained" size="small" onClick={login}>
      Connect Wallet
    </Button>
  );
}
