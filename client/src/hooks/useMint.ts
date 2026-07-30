import { useState, useCallback } from "react";
import { useAccount, useContract, useSendTransaction } from "@starknet-start/react";
import { CairoOption, CairoOptionVariant } from "starknet";
import { MintSaltCounter } from "@provable-games/denshokan-sdk";
import { useChainConfig } from "../contexts/NetworkContext";
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
  const { chainConfig } = useChainConfig();
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { contract } = useContract({
    abi: denshokanAbi as any,
    address: chainConfig.denshokanAddress as `0x${string}`,
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
          none(), // skills_address (Option<ContractAddress>)
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
            none(), // skills_address
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

  /**
   * Batch mint using the contract's native mint_batch entrypoint.
   * Sends a single call with an Array<MintParams> instead of N
   * individual mint calls, so starknet.js only serialises once.
   */
  const mintBatchCount = useCallback(
    async (params: MintParams, count: number): Promise<MintResult | null> => {
      if (!address || !contract) {
        setError("Wallet not connected");
        return null;
      }
      if (count <= 0) {
        setError("Count must be positive");
        return null;
      }

      setMinting(true);
      setError(null);

      try {
        const none = <T>() => new CairoOption<T>(CairoOptionVariant.None);
        const some = <T>(val: T) => new CairoOption<T>(CairoOptionVariant.Some, val);

        const saltCounter = new MintSaltCounter();

        const mints = Array.from({ length: count }, () => ({
          game_address: params.gameAddress,
          player_name: params.playerName ? some(params.playerName) : none(),
          settings_id: params.settingsId !== undefined ? some(params.settingsId) : none(),
          start: params.start !== undefined ? some(params.start) : none(),
          end: params.end !== undefined ? some(params.end) : none(),
          objective_id: params.objectiveId !== undefined ? some(params.objectiveId) : none(),
          context: none(),
          client_url: params.clientUrl ? some(params.clientUrl) : none(),
          renderer_address: none(),
          skills_address: none(),
          to: params.recipientAddress || address,
          soulbound: params.soulbound ?? false,
          paymaster: false,
          salt: params.salt ?? saltCounter.next(),
          metadata: 0,
        }));

        const call = contract.populate("mint_batch", [mints]);
        const result = await sendAsync([call]);

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

  return { mint, mintBatch, mintBatchCount, minting, error };
}
