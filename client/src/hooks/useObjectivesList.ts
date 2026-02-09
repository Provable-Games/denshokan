import { useAllObjectives } from "@provable-games/denshokan-sdk/react";
import type { GlobalObjectiveEntry, GlobalObjectivesParams } from "@provable-games/denshokan-sdk";

export interface ClientObjective {
  gameAddress: string;
  objectiveId: number;
  creatorAddress: string;
  objectiveData: string | null;
  blockNumber: string;
  createdAt: string;
}

function adaptObjective(o: GlobalObjectiveEntry): ClientObjective {
  return {
    gameAddress: o.gameAddress,
    objectiveId: o.objectiveId,
    creatorAddress: o.creatorAddress,
    objectiveData: o.objectiveData,
    blockNumber: o.blockNumber,
    createdAt: o.createdAt,
  };
}

export function useObjectivesList(params?: GlobalObjectivesParams) {
  const { data, isLoading, refetch } = useAllObjectives(params);

  return {
    objectives: data?.data.map(adaptObjective) ?? [],
    total: data?.total ?? 0,
    loading: isLoading,
    refetch,
  };
}
