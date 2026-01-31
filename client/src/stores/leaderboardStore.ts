import { create } from "zustand";
import { api } from "../services/api";

interface LeaderboardEntry {
  rank: number;
  tokenId: string;
  ownerAddress: string;
  playerName: string | null;
  score: string;
}

interface LeaderboardStore {
  entries: Record<number, LeaderboardEntry[]>;
  loading: Record<number, boolean>;
  fetchLeaderboard: (gameId: number, params?: { limit?: number; offset?: number }) => Promise<void>;
  updateFromWS: (gameId: number, data: any) => void;
}

export const useLeaderboardStore = create<LeaderboardStore>((set) => ({
  entries: {},
  loading: {},

  fetchLeaderboard: async (gameId, params) => {
    set((s) => ({ loading: { ...s.loading, [gameId]: true } }));
    try {
      const res = await api.getGameLeaderboard(gameId, params);
      set((s) => ({
        entries: { ...s.entries, [gameId]: res.data },
        loading: { ...s.loading, [gameId]: false },
      }));
    } catch {
      set((s) => ({ loading: { ...s.loading, [gameId]: false } }));
    }
  },

  updateFromWS: (gameId, data) => {
    // Re-fetch on leaderboard change events
    const store = useLeaderboardStore.getState();
    store.fetchLeaderboard(gameId);
  },
}));
