import { useState, useCallback } from "react";
import {
  useAccount,
  useContract,
  useSendTransaction,
  useReadContract,
} from "@starknet-react/core";
import numberGuessAbi from "../abi/numberGuess.json";

export interface CreateSettingsParams {
  name: string;
  description: string;
  min: number;
  max: number;
  maxAttempts: number;
}

export interface CreateObjectiveParams {
  name: string;
  description: string;
  objectiveType: 1 | 2 | 3; // 1=Win, 2=WinWithinN, 3=PerfectGame
  threshold: number;
}

export interface UseNumberGuessConfigReturn {
  // Actions
  createSettings: (params: CreateSettingsParams) => Promise<number | null>;
  createObjective: (params: CreateObjectiveParams) => Promise<number | null>;

  // Counts
  settingsCount: number;
  objectiveCount: number;

  // Loading states
  isCreatingSettings: boolean;
  isCreatingObjective: boolean;
  error: string | null;

  // Refresh
  refetch: () => void;
}

export function useNumberGuessConfig(
  gameAddress: string
): UseNumberGuessConfigReturn {
  const { address } = useAccount();
  const [isCreatingSettings, setIsCreatingSettings] = useState(false);
  const [isCreatingObjective, setIsCreatingObjective] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { contract } = useContract({
    abi: numberGuessAbi as any,
    address: gameAddress as `0x${string}`,
  });

  const { sendAsync } = useSendTransaction({});

  // Read settings count
  const { data: settingsCountData, refetch: refetchSettingsCount } =
    useReadContract({
      abi: numberGuessAbi as any,
      address: gameAddress as `0x${string}`,
      functionName: "settings_count",
      args: [],
    });

  // Read objective count
  const { data: objectiveCountData, refetch: refetchObjectiveCount } =
    useReadContract({
      abi: numberGuessAbi as any,
      address: gameAddress as `0x${string}`,
      functionName: "objective_count",
      args: [],
    });

  const refetch = useCallback(() => {
    refetchSettingsCount();
    refetchObjectiveCount();
  }, [refetchSettingsCount, refetchObjectiveCount]);

  const createSettings = useCallback(
    async (params: CreateSettingsParams): Promise<number | null> => {
      if (!address || !contract) {
        setError("Wallet not connected");
        return null;
      }

      if (params.max <= params.min) {
        setError("Max must be greater than min");
        return null;
      }

      setIsCreatingSettings(true);
      setError(null);

      try {
        const call = contract.populate("create_settings", [
          params.name,
          params.description,
          params.min,
          params.max,
          params.maxAttempts,
        ]);
        await sendAsync([call]);

        // Refetch to get the new count
        setTimeout(() => {
          refetch();
        }, 1000);

        // The new settings ID will be the previous count + 1
        const currentCount = settingsCountData
          ? Number(settingsCountData)
          : 0;
        return currentCount + 1;
      } catch (e: any) {
        setError(e.message || "Failed to create settings");
        return null;
      } finally {
        setIsCreatingSettings(false);
      }
    },
    [address, contract, sendAsync, refetch, settingsCountData]
  );

  const createObjective = useCallback(
    async (params: CreateObjectiveParams): Promise<number | null> => {
      if (!address || !contract) {
        setError("Wallet not connected");
        return null;
      }

      if (params.objectiveType < 1 || params.objectiveType > 3) {
        setError("Invalid objective type (must be 1-3)");
        return null;
      }

      setIsCreatingObjective(true);
      setError(null);

      try {
        const call = contract.populate("create_objective", [
          params.name,
          params.description,
          params.objectiveType,
          params.threshold,
        ]);
        await sendAsync([call]);

        // Refetch to get the new count
        setTimeout(() => {
          refetch();
        }, 1000);

        // The new objective ID will be the previous count + 1
        const currentCount = objectiveCountData
          ? Number(objectiveCountData)
          : 0;
        return currentCount + 1;
      } catch (e: any) {
        setError(e.message || "Failed to create objective");
        return null;
      } finally {
        setIsCreatingObjective(false);
      }
    },
    [address, contract, sendAsync, refetch, objectiveCountData]
  );

  const settingsCount = settingsCountData ? Number(settingsCountData) : 0;
  const objectiveCount = objectiveCountData ? Number(objectiveCountData) : 0;

  return {
    createSettings,
    createObjective,
    settingsCount,
    objectiveCount,
    isCreatingSettings,
    isCreatingObjective,
    error,
    refetch,
  };
}
