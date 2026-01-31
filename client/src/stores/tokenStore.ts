import { create } from "zustand";
import { api } from "../services/api";

interface Token {
  tokenId: string;
  gameId: number;
  ownerAddress: string;
  playerName: string | null;
  currentScore: string;
  gameOver: boolean;
  soulbound: boolean;
  completedAllObjectives: boolean;
  mintedAt: string;
  lastUpdatedAt: string;
}

interface TokenStore {
  tokens: Token[];
  tokensLoading: boolean;
  total: number;
  tokenDetails: Record<string, any>;
  fetchTokens: (params?: { game_id?: number; owner?: string; game_over?: string; limit?: number; offset?: number }) => Promise<void>;
  fetchTokenDetail: (tokenId: string) => Promise<void>;
  updateTokenFromWS: (data: any) => void;
}

export const useTokenStore = create<TokenStore>((set) => ({
  tokens: [],
  tokensLoading: false,
  total: 0,
  tokenDetails: {},

  fetchTokens: async (params) => {
    set({ tokensLoading: true });
    try {
      const res = await api.getTokens(params);
      set({ tokens: res.data, total: res.total, tokensLoading: false });
    } catch {
      set({ tokensLoading: false });
    }
  },

  fetchTokenDetail: async (tokenId) => {
    try {
      const res = await api.getToken(tokenId);
      set((s) => ({ tokenDetails: { ...s.tokenDetails, [tokenId]: res.data } }));
    } catch {}
  },

  updateTokenFromWS: (data) => {
    set((s) => {
      const updated = s.tokens.map((t) =>
        t.tokenId === data.token_id ? { ...t, ...data } : t
      );
      return { tokens: updated };
    });
  },
}));
