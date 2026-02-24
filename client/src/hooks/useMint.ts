import { useState, useCallback } from "react";
import { useAccount, useContract, useSendTransaction } from "@starknet-react/core";
import { CairoOption, CairoOptionVariant } from "starknet";
import { MintSaltCounter } from "@provable-games/denshokan-sdk";
import { config } from "../config";
import denshokanAbi from "../abi/denshokan.json";

interface MintParams {
  gameAddress: string;
  playerName?: string;
  settingsId?: number;
  soulbound?: boolean;
  start?: number;
  end?: number;
  objectiveId?: number;
  clientUrl?: string;
  recipientAddress?: string;
  salt?: number;
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
        // Build the mint call - starknet.js v8 requires CairoOption instances
        const none = <T>() => new CairoOption<T>(CairoOptionVariant.None);
        const some = <T>(val: T) => new CairoOption<T>(CairoOptionVariant.Some, val);

        const call = contract.populate("mint", [
          params.gameAddress, // game_address (ContractAddress)
          params.playerName ? some(params.playerName) : none(), // player_name (Option)
          params.settingsId !== undefined ? some(params.settingsId) : none(), // settings_id (Option)
          params.start !== undefined ? some(params.start) : none(), // start (Option<u64>)
          params.end !== undefined ? some(params.end) : none(), // end (Option<u64>)
          params.objectiveId !== undefined ? some(params.objectiveId) : none(), // objective_id (Option<u32>)
          none(), // context (Option<GameContextDetails>)
          params.clientUrl ? some(params.clientUrl) : none(), // client_url (Option<ByteArray>)
          none(), // renderer_address (Option<ContractAddress>)
          params.recipientAddress || address, // to
          params.soulbound ?? false, // soulbound
          false, // paymaster
          params.salt ?? 0, // salt
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

  const mintBatch = useCallback(
    async (paramsList: MintParams[]): Promise<MintResult | null> => {
      if (!address || !contract) {
        setError("Wallet not connected");
        return null;
      }
      if (paramsList.length === 0) {
        setError("No mint params provided");
        return null;
      }

      setMinting(true);
      setError(null);

      try {
        const none = <T>() => new CairoOption<T>(CairoOptionVariant.None);
        const some = <T>(val: T) => new CairoOption<T>(CairoOptionVariant.Some, val);

        const saltCounter = new MintSaltCounter();

        const calls = paramsList.map((params) => {
          const autoSalt = saltCounter.next(); // Always advance to prevent collisions
          return contract.populate("mint", [
            params.gameAddress,
            params.playerName ? some(params.playerName) : none(),
            params.settingsId !== undefined ? some(params.settingsId) : none(),
            params.start !== undefined ? some(params.start) : none(),
            params.end !== undefined ? some(params.end) : none(),
            params.objectiveId !== undefined ? some(params.objectiveId) : none(),
            none(), // context
            params.clientUrl ? some(params.clientUrl) : none(),
            none(), // renderer_address
            params.recipientAddress || address,
            params.soulbound ?? false,
            false, // paymaster
            params.salt ?? autoSalt,
            0, // metadata
          ]);
        });

        const result = await sendAsync(calls);

        setMinting(false);
        return { transactionHash: result.transaction_hash };
      } catch (e: any) {
        setError(e.message || "Batch mint failed");
        setMinting(false);
        return null;
      }
    },
    [address, contract, sendAsync]
  );

  return { mint, mintBatch, minting, error };
}
