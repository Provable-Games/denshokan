import { useState } from "react";
import { Box, Typography, Alert, Card, CardContent } from "@mui/material";
import { motion, AnimatePresence } from "framer-motion";
import MintForm, { MintFormParams } from "../components/mint/MintForm";
import { useController } from "../contexts/ControllerContext";
import { useMint } from "../hooks/useMint";
import { config } from "../config";

export default function MintTokenPage() {
  const { isConnected } = useController();
  const { mint, minting, error } = useMint();
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleMint = async (params: MintFormParams) => {
    setTxHash(null);
    const result = await mint(params);
    if (result) {
      setTxHash(result.transactionHash);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Typography variant="h3" gutterBottom>
        Mint Game Token
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        Select a game and mint a new token to start playing.
      </Typography>

      <AnimatePresence>
        {txHash && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{ width: "100%", maxWidth: 520 }}
          >
            <Alert severity="success" sx={{ mb: 2 }}>
              Token minted!{" "}
              <a
                href={`${config.explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on explorer
              </a>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      <Card variant="outlined" sx={{ width: "100%", maxWidth: 520 }}>
        <CardContent sx={{ p: 3 }}>
          <MintForm onMint={handleMint} minting={minting} error={error} />
        </CardContent>
      </Card>
    </Box>
  );
}
