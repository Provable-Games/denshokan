import { useMinters } from "@provable-games/denshokan-sdk/react";
import type { Minter } from "@provable-games/denshokan-sdk";

export interface MintersParams {
  limit?: number;
  offset?: number;
}

export interface ClientMinter {
  id: string;
  name: string | null;
  address: string;
  minterId: string;
  blockNumber: string;
}

function adaptMinter(m: Minter): ClientMinter {
  return {
    id: m.id,
    name: m.name || null,
    address: m.contractAddress,
    minterId: m.minterId,
    blockNumber: m.blockNumber,
  };
}

export function useMinterList(params?: MintersParams) {
  const { data, isLoading, refetch } = useMinters(params);

  return {
    minters: data?.data.map(adaptMinter) ?? [],
    total: data?.total ?? 0,
    loading: isLoading,
    refetch,
  };
}
