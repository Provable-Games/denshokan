import { create } from "zustand";
import { api } from "../services/api";

interface PlayerStats {
  address: string;
  totalTokens: number;
  gamesPlayed: number;
  completedGames: number;
  activeGames: number;
  totalScore: string;
}

interface WalletStore {
  playerStats: PlayerStats | null;
  playerTokens: any[];
  playerTokensLoading: boolean;
  statsLoading: boolean;
  fetchPlayerStats: (address: string) => Promise<void>;
  fetchPlayerTokens: (address: string, params?: { game_id?: number; limit?: number; offset?: number }) => Promise<void>;
  reset: () => void;
}

export const useWalletStore = create<WalletStore>((set) => ({
  playerStats: null,
  playerTokens: [],
  playerTokensLoading: false,
  statsLoading: false,

  fetchPlayerStats: async (address) => {
    set({ statsLoading: true });
    try {
      const res = await api.getPlayerStats(address);
      set({ playerStats: res.data, statsLoading: false });
    } catch {
      set({ statsLoading: false });
    }
  },

  fetchPlayerTokens: async (address, params) => {
    set({ playerTokensLoading: true });
    try {
      const res = await api.getPlayerTokens(address, params);
      set({ playerTokens: res.data, playerTokensLoading: false });
    } catch {
      set({ playerTokensLoading: false });
    }
  },

  reset: () => set({ playerStats: null, playerTokens: [], playerTokensLoading: false, statsLoading: false }),
}));
