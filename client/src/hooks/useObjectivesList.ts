import { useObjectives } from "@provable-games/denshokan-sdk/react";
import type { GameObjectiveDetails, ObjectivesParams } from "@provable-games/denshokan-sdk";

export interface ClientObjective {
  gameAddress: string;
  objectiveId: number;
  creatorAddress: string;
  name: string;
  description: string;
  objectives: Record<string, string>;
  blockNumber: string;
  createdAt: string;
}

function adaptObjective(o: GameObjectiveDetails): ClientObjective {
  return {
    gameAddress: o.gameAddress,
    objectiveId: o.id,
    creatorAddress: o.creatorAddress,
    name: o.name,
    description: o.description,
    objectives: o.objectives,
    blockNumber: o.blockNumber,
    createdAt: o.createdAt,
  };
}

export function useObjectivesList(params?: ObjectivesParams) {
  const { data, isLoading, refetch } = useObjectives(params);

  return {
    objectives: data?.data.map(adaptObjective) ?? [],
    total: data?.total ?? 0,
    loading: isLoading,
    refetch,
  };
}
