import { useAllSettings } from "@provable-games/denshokan-sdk/react";
import type { GlobalSettingEntry, GlobalSettingsParams } from "@provable-games/denshokan-sdk";

export interface ClientSetting {
  gameAddress: string;
  settingsId: number;
  creatorAddress: string;
  settingsData: string | null;
  blockNumber: string;
  createdAt: string;
}

function adaptSetting(s: GlobalSettingEntry): ClientSetting {
  return {
    gameAddress: s.gameAddress,
    settingsId: s.settingsId,
    creatorAddress: s.creatorAddress,
    settingsData: s.settingsData,
    blockNumber: s.blockNumber,
    createdAt: s.createdAt,
  };
}

export function useSettingsList(params?: GlobalSettingsParams) {
  const { data, isLoading, refetch } = useAllSettings(params);

  return {
    settings: data?.data.map(adaptSetting) ?? [],
    total: data?.total ?? 0,
    loading: isLoading,
    refetch,
  };
}
