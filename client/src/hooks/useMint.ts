import { useState, useCallback } from "react";
import { useAccount, useContract, useSendTransaction } from "@starknet-react/core";
import { config } from "../config";
import denshokanAbi from "../abi/denshokan.json";

interface MintParams {
  gameId?: number;
  playerName?: string;
  settingsId?: number;
  soulbound?: boolean;
}

interface MintResult {
  transactionHash: string;
}

export function useMint() {
  const { address } = useAccount();
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { contract } = useContract({
    abi: denshokanAbi as any,
    address: config.denshokanAddress as `0x${string}`,
  });

  const { sendAsync } = useSendTransaction({});

  const mint = useCallback(
    async (params: MintParams): Promise<MintResult | null> => {
      if (!address || !contract) {
        setError("Wallet not connected");
        return null;
      }

      setMinting(true);
      setError(null);

      try {
        // Build the mint call - the contract's mint function uses Option types
        // None = [0], Some(value) = [1, value]
        const call = contract.populate("mint", [
          params.gameId !== undefined ? { Some: params.gameId } : { None: true }, // game_address (Option)
          params.playerName ? { Some: params.playerName } : { None: true }, // player_name (Option)
          params.settingsId !== undefined ? { Some: params.settingsId } : { None: true }, // settings_id (Option)
          { None: true }, // start (Option<u64>)
          { None: true }, // end (Option<u64>)
          { None: true }, // objective_id (Option<u32>)
          { None: true }, // context (Option<GameContextDetails>)
          { None: true }, // client_url (Option<ByteArray>)
          { None: true }, // renderer_address (Option<ContractAddress>)
          address, // to
          params.soulbound ?? false, // soulbound
          false, // paymaster
          0, // salt
          0, // metadata
        ]);

        const result = await sendAsync([call]);

        setMinting(false);
        return { transactionHash: result.transaction_hash };
      } catch (e: any) {
        setError(e.message || "Mint failed");
        setMinting(false);
        return null;
      }
    },
    [address, contract, sendAsync]
  );

  return { mint, minting, error };
}
