import { useState, useCallback, useEffect } from "react";
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
  gameAddress: string
): UseNumberGuessConfigReturn {
  const { address } = useAccount();
  const [isCreatingSettings, setIsCreatingSettings] = useState(false);
  const [isCreatingObjective, setIsCreatingObjective] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isLoadingObjectives, setIsLoadingObjectives] = useState(false);
  const [settings, setSettings] = useState<SettingsItem[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveItem[]>([]);
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

  // Fetch all settings details when count changes
  useEffect(() => {
    if (!contract || !settingsCountData) return;

    const fetchSettings = async () => {
      setIsLoadingSettings(true);
      try {
        const count = Number(settingsCountData);
        const items: SettingsItem[] = [];

        for (let id = 1; id <= count; id++) {
          try {
            const result = await contract.call("settings_details", [id]);
            // Result is GameSettingDetails: { name, description, settings }
            const details = result as any;

            // Parse settings array to extract min, max, max_attempts
            let min = 1, max = 100, maxAttempts = 0;
            const settingsArr = details.settings || [];
            for (const s of settingsArr) {
              const name = s.name?.toString?.() || s.name || "";
              const value = s.value?.toString?.() || s.value || "0";
              if (name === "min") min = parseInt(value) || 1;
              if (name === "max") max = parseInt(value) || 100;
              if (name === "max_attempts") maxAttempts = parseInt(value) || 0;
            }

            items.push({
              id,
              name: details.name?.toString?.() || details.name || `Settings #${id}`,
              description: details.description?.toString?.() || details.description || "",
              min,
              max,
              maxAttempts,
            });
          } catch (e) {
            console.error(`Failed to fetch settings ${id}:`, e);
          }
        }

        setSettings(items);
      } catch (e) {
        console.error("Failed to fetch settings:", e);
      } finally {
        setIsLoadingSettings(false);
      }
    };

    fetchSettings();
  }, [contract, settingsCountData]);

  // Fetch all objectives details when count changes
  useEffect(() => {
    if (!contract || !objectiveCountData) return;

    const fetchObjectives = async () => {
      setIsLoadingObjectives(true);
      try {
        const count = Number(objectiveCountData);
        const items: ObjectiveItem[] = [];

        for (let id = 1; id <= count; id++) {
          try {
            const result = await contract.call("get_objective", [id]);
            // Result is (name, description, objective_type, threshold)
            const [name, description, objectiveType, threshold] = result as any;

            items.push({
              id,
              name: name?.toString?.() || name || `Objective #${id}`,
              description: description?.toString?.() || description || "",
              objectiveType: Number(objectiveType) || 1,
              threshold: Number(threshold) || 1,
            });
          } catch (e) {
            console.error(`Failed to fetch objective ${id}:`, e);
          }
        }

        setObjectives(items);
      } catch (e) {
        console.error("Failed to fetch objectives:", e);
      } finally {
        setIsLoadingObjectives(false);
      }
    };

    fetchObjectives();
  }, [contract, objectiveCountData]);

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
