import { config } from "../config";

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.apiUrl;
  }

  private async fetch<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `API error: ${res.status}`);
    }
    return res.json();
  }

  // Health
  health() {
    return this.fetch<{ status: string; db: boolean }>("/health");
  }

  // Games
  getGames(params?: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return this.fetch<{ data: any[] }>(`/games${q ? `?${q}` : ""}`);
  }

  getGame(gameId: number) {
    return this.fetch<{ data: any }>(`/games/${gameId}`);
  }

  getGameStats(gameId: number) {
    return this.fetch<{ data: any }>(`/games/${gameId}/stats`);
  }

  getGameLeaderboard(gameId: number, params?: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return this.fetch<{ data: any[] }>(`/games/${gameId}/leaderboard${q ? `?${q}` : ""}`);
  }

  getLeaderboardPosition(gameId: number, tokenId: string, context?: number) {
    const qs = context ? `?context=${context}` : "";
    return this.fetch<{ data: any }>(`/games/${gameId}/leaderboard/position/${tokenId}${qs}`);
  }

  // Tokens
  getTokens(params?: { game_id?: number; owner?: string; game_over?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.game_id) qs.set("game_id", String(params.game_id));
    if (params?.owner) qs.set("owner", params.owner);
    if (params?.game_over) qs.set("game_over", params.game_over);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return this.fetch<{ data: any[]; total: number }>(`/tokens${q ? `?${q}` : ""}`);
  }

  getToken(tokenId: string) {
    return this.fetch<{ data: any }>(`/tokens/${tokenId}`);
  }

  getTokenScores(tokenId: string, limit?: number) {
    const qs = limit ? `?limit=${limit}` : "";
    return this.fetch<{ data: any[] }>(`/tokens/${tokenId}/scores${qs}`);
  }

  // Players
  getPlayerTokens(address: string, params?: { game_id?: number; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.game_id) qs.set("game_id", String(params.game_id));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return this.fetch<{ data: any[]; total: number }>(`/players/${address}/tokens${q ? `?${q}` : ""}`);
  }

  getPlayerStats(address: string) {
    return this.fetch<{ data: any }>(`/players/${address}/stats`);
  }

  // Minters
  getMinters() {
    return this.fetch<{ data: any[] }>("/minters");
  }

  getMinter(minterId: string) {
    return this.fetch<{ data: any }>(`/minters/${minterId}`);
  }

  // Activity
  getActivity(params?: { type?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return this.fetch<{ data: any[] }>(`/activity${q ? `?${q}` : ""}`);
  }

  getActivityStats(gameId?: number) {
    const qs = gameId ? `?game_id=${gameId}` : "";
    return this.fetch<{ data: any }>(`/activity/stats${qs}`);
  }
}

export const api = new ApiClient();
