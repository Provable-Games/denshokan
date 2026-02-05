import { useState, useCallback } from "react";
import {
  useAccount,
  useContract,
  useSendTransaction,
} from "@starknet-react/core";
import {
  useSettingsDetails,
  useObjectivesDetails,
  useSettingsCount,
  useObjectivesCount,
} from "@provable-games/denshokan-sdk/react";
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

export interface SettingsItem {
  id: number;
  name: string;
  description: string;
  min: number;
  max: number;
  maxAttempts: number;
}

export interface ObjectiveItem {
  id: number;
  name: string;
  description: string;
  objectiveType: number;
  threshold: number;
}

export interface UseNumberGuessConfigReturn {
  // Actions
  createSettings: (params: CreateSettingsParams) => Promise<number | null>;
  createObjective: (params: CreateObjectiveParams) => Promise<number | null>;

  // Data
  settings: SettingsItem[];
  objectives: ObjectiveItem[];

  // Counts
  settingsCount: number;
  objectiveCount: number;

  // Loading states
  isCreatingSettings: boolean;
  isCreatingObjective: boolean;
  isLoadingSettings: boolean;
  isLoadingObjectives: boolean;
  error: string | null;

  // Refresh
  refetch: () => void;
}

export function useNumberGuessConfig(
  gameAddress: string,
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

  // Use SDK hooks for fetching settings and objectives
  const { data: settingsCountData, refetch: refetchSettingsCount } =
    useSettingsCount(gameAddress || undefined);

  const { data: objectivesCountData, refetch: refetchObjectivesCount } =
    useObjectivesCount(gameAddress || undefined);

  console.log("Objectives Count Data:", objectivesCountData, gameAddress);
  const {
    data: settingsData,
    isLoading: isLoadingSettings,
    refetch: refetchSettings,
  } = useSettingsDetails(gameAddress || undefined);

  const {
    data: objectivesData,
    isLoading: isLoadingObjectives,
    refetch: refetchObjectives,
  } = useObjectivesDetails(gameAddress || undefined);

  const refetch = useCallback(() => {
    refetchSettingsCount();
    refetchObjectivesCount();
    refetchSettings();
    refetchObjectives();
  }, [
    refetchSettingsCount,
    refetchObjectivesCount,
    refetchSettings,
    refetchObjectives,
  ]);

  // Transform SDK data to client format
  const settings: SettingsItem[] = (settingsData?.data ?? []).map((s) => {
    // Parse settings array to extract min, max, max_attempts
    let min = 1,
      max = 100,
      maxAttempts = 0;
    for (const setting of s.settings) {
      if (setting.name === "min") min = parseInt(setting.value) || 1;
      if (setting.name === "max") max = parseInt(setting.value) || 100;
      if (setting.name === "max_attempts")
        maxAttempts = parseInt(setting.value) || 0;
    }
    return {
      id: s.id,
      name: s.name || `Settings #${s.id}`,
      description: s.description || "",
      min,
      max,
      maxAttempts,
    };
  });

  const objectives: ObjectiveItem[] = (objectivesData?.data ?? []).map((o) => {
    // Parse objectives array to extract type and threshold
    let objectiveType = 1,
      threshold = 1;
    for (const obj of o.objectives) {
      if (obj.name === "type") objectiveType = parseInt(obj.value) || 1;
      if (obj.name === "threshold") threshold = parseInt(obj.value) || 1;
    }
    return {
      id: o.id,
      name: o.name || `Objective #${o.id}`,
      description: o.description || "",
      objectiveType,
      threshold,
    };
  });

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
        const currentCount = settingsCountData ?? 0;
        return currentCount + 1;
      } catch (e: any) {
        setError(e.message || "Failed to create settings");
        return null;
      } finally {
        setIsCreatingSettings(false);
      }
    },
    [address, contract, sendAsync, refetch, settingsCountData],
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
        const currentCount = objectivesCountData ?? 0;
        return currentCount + 1;
      } catch (e: any) {
        setError(e.message || "Failed to create objective");
        return null;
      } finally {
        setIsCreatingObjective(false);
      }
    },
    [address, contract, sendAsync, refetch, objectivesCountData],
  );

  const settingsCount = settingsCountData ?? 0;
  const objectiveCount = objectivesCountData ?? 0;

  return {
    createSettings,
    createObjective,
    settings,
    objectives,
    settingsCount,
    objectiveCount,
    isCreatingSettings,
    isCreatingObjective,
    isLoadingSettings,
    isLoadingObjectives,
    error,
    refetch,
  };
}
