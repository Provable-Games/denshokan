import { useSettings } from "@provable-games/denshokan-sdk/react";
import type { GameSettingDetails, SettingsParams } from "@provable-games/denshokan-sdk";

export interface ClientSetting {
  gameAddress: string;
  settingsId: number;
  creatorAddress: string;
  name: string;
  description: string;
  settings: Record<string, string>;
  blockNumber: string;
  createdAt: string;
}

function adaptSetting(s: GameSettingDetails): ClientSetting {
  return {
    gameAddress: s.gameAddress,
    settingsId: s.id,
    creatorAddress: s.creatorAddress,
    name: s.name,
    description: s.description,
    settings: s.settings,
    blockNumber: s.blockNumber,
    createdAt: s.createdAt,
  };
}

export function useSettingsList(params?: SettingsParams) {
  const { data, isLoading, refetch } = useSettings(params);

  return {
    settings: data?.data.map(adaptSetting) ?? [],
    total: data?.total ?? 0,
    loading: isLoading,
    refetch,
  };
}
