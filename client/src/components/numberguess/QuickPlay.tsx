import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
} from "@mui/material";
import { PlayArrow } from "@mui/icons-material";
import {
  useAccount,
  useContract,
  useSendTransaction,
} from "@starknet-start/react";
import { RpcProvider, CairoOption, CairoOptionVariant, TransactionFinalityStatus } from "starknet";
import { useNumberGuessConfig } from "../../hooks/useNumberGuessConfig";
import { useChainConfig } from "../../contexts/NetworkContext";
import numberGuessAbi from "../../abi/numberGuess.json";
import { gameColors } from "./gameColors";

interface Props {
  gameAddress: string;
}

export default function QuickPlay({ gameAddress }: Props) {
  const navigate = useNavigate();
  const { address } = useAccount();
  const { chainConfig } = useChainConfig();
  const [selectedSettings, setSelectedSettings] = useState<number>(0);
  const [selectedObjective, setSelectedObjective] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { contract: gameContract } = useContract({
    abi: numberGuessAbi as any,
    address: gameAddress as `0x${string}`,
  });

  const { sendAsync } = useSendTransaction({});

  const {
    settings,
    objectives,
    isLoadingSettings,
    isLoadingObjectives,
  } = useNumberGuessConfig(gameAddress);

  const handleQuickPlay = useCallback(async () => {
    if (!address || !gameContract) {
      setError("Wallet not connected");
      return;
    }

    setIsPlaying(true);
    setError(null);

    try {
      const none = <T,>() => new CairoOption<T>(CairoOptionVariant.None);
      const some = <T,>(val: T) => new CairoOption<T>(CairoOptionVariant.Some, val);

      // Step 1: Mint a new token
      const mintCall = gameContract.populate("mint_game", [
        none(),                                                      // player_name
        selectedSettings > 0 ? some(selectedSettings) : none(),      // settings_id
        none(),                                                      // start
        none(),                                                      // end
        selectedObjective > 0 ? some(selectedObjective) : none(),    // objective_id
        none(),                                                      // context
        none(),                                                      // client_url
        none(),                                                      // renderer_address
        none(),                                                      // skills_address
        address,                                                     // to
        false,                                                       // soulbound
        false,                                                       // paymaster
        0,                                                           // salt
        0,                                                           // metadata
      ]);

      const mintResult = await sendAsync([mintCall]);

      // Step 2: Get the new token ID from the receipt
      const rpc = new RpcProvider({ nodeUrl: chainConfig.rpcUrl });
      const receipt = await rpc.waitForTransaction(mintResult.transaction_hash, {
        successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
        retryInterval: 300,
      });

      const denshokanAddr = BigInt(chainConfig.denshokanAddress);
      let newTokenId: string | null = null;

      for (const event of (receipt as any).events || []) {
        const fromAddr = BigInt(event.from_address || "0x0");
        if (fromAddr !== denshokanAddr) continue;

        // Transfer event: keys = [selector, from, to, token_id_low, token_id_high]
        const keys: string[] = event.keys || [];
        if (keys.length >= 5 && BigInt(keys[1]) === 0n) {
          // Reconstruct felt252 token_id from u256 (low + high * 2^128)
          const low = BigInt(keys[3]);
          const high = BigInt(keys[4]);
          const fullId = low + high * (2n ** 128n);
          newTokenId = "0x" + fullId.toString(16);
          break;
        }
      }

      if (!newTokenId) {
        throw new Error("Could not find minted token ID in receipt");
      }

      // Step 3: Start a new game on the minted token
      const newGameCall = gameContract.populate("new_game", [newTokenId]);
      await sendAsync([newGameCall]);

      // Step 4: Navigate to the play page (pass state so GameBoard knows game is already started)
      navigate(`/tokens/${newTokenId}/play`, { state: { gameStarted: true, gameAddress } });
    } catch (e: any) {
      setError(e.message || "Failed to start game");
    } finally {
      setIsPlaying(false);
    }
  }, [address, gameContract, sendAsync, chainConfig, selectedSettings, selectedObjective, navigate]);

  const isLoading = isLoadingSettings || isLoadingObjectives;

  // Find selected settings for preview
  const selectedSettingsItem = settings.find((s) => s.id === selectedSettings);

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Quick Play
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Pick your settings and start playing right away.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Difficulty</InputLabel>
              <Select
                value={selectedSettings}
                label="Difficulty"
                onChange={(e) => setSelectedSettings(e.target.value as number)}
                disabled={isPlaying}
              >
                <MenuItem value={0}>Default</MenuItem>
                {settings.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Objective</InputLabel>
              <Select
                value={selectedObjective}
                label="Objective"
                onChange={(e) => setSelectedObjective(e.target.value as number)}
                disabled={isPlaying}
              >
                <MenuItem value={0}>None</MenuItem>
                {objectives.map((o) => (
                  <MenuItem key={o.id} value={o.id}>
                    {o.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {selectedSettingsItem && (
            <Typography variant="body2" color="text.secondary">
              Range: {selectedSettingsItem.min}–{selectedSettingsItem.max}
              {selectedSettingsItem.maxAttempts > 0
                ? `, ${selectedSettingsItem.maxAttempts} attempts`
                : ", unlimited attempts"}
            </Typography>
          )}

          <Box>
            <Button
              variant="contained"
              size="large"
              startIcon={isPlaying ? <CircularProgress size={18} color="inherit" /> : <PlayArrow />}
              onClick={handleQuickPlay}
              disabled={isPlaying || !address}
              sx={{
                px: 4,
                py: 1.2,
                fontWeight: 700,
                background: `linear-gradient(135deg, ${gameColors.activeRange} 0%, #3F1DCB 100%)`,
                boxShadow: `0 4px 20px ${gameColors.activeRange}44`,
                "&:hover": {
                  background: `linear-gradient(135deg, ${gameColors.rangeLight} 0%, ${gameColors.activeRange} 100%)`,
                },
              }}
            >
              {isPlaying ? "Starting..." : "Play Now"}
            </Button>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
