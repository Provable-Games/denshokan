import { create } from "zustand";
import { api } from "../services/api";

interface Game {
  id: string;
  gameId: number;
  contractAddress: string;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  createdAt: string;
}

interface GameStats {
  gameId: number;
  totalTokens: number;
  completedGames: number;
  activeGames: number;
  uniquePlayers: number;
  lastUpdated: string;
}

interface GameStore {
  games: Game[];
  gamesLoading: boolean;
  gameDetails: Record<number, Game>;
  gameStats: Record<number, GameStats>;
  fetchGames: () => Promise<void>;
  fetchGameDetail: (gameId: number) => Promise<void>;
  fetchGameStats: (gameId: number) => Promise<void>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  games: [],
  gamesLoading: false,
  gameDetails: {},
  gameStats: {},

  fetchGames: async () => {
    set({ gamesLoading: true });
    try {
      const res = await api.getGames();
      set({ games: res.data, gamesLoading: false });
    } catch {
      set({ gamesLoading: false });
    }
  },

  fetchGameDetail: async (gameId) => {
    try {
      const res = await api.getGame(gameId);
      set((s) => ({ gameDetails: { ...s.gameDetails, [gameId]: res.data } }));
    } catch {}
  },

  fetchGameStats: async (gameId) => {
    try {
      const res = await api.getGameStats(gameId);
      set((s) => ({ gameStats: { ...s.gameStats, [gameId]: res.data } }));
    } catch {}
  },
}));
