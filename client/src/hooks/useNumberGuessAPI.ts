import { useState, useEffect, useCallback, useRef } from "react";
import { useChainConfig } from "../contexts/NetworkContext";
import type {
  ApiGameSession,
  ApiGuess,
  ApiGameStats,
  ApiPlayerData,
  PaginatedResponse,
} from "./numberGuessApi.types";

interface FetchState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

function useNumberGuessApiClient() {
  const { chainConfig } = useChainConfig();
  const baseUrl = chainConfig.numberGuessApiUrl;

  const get = useCallback(
    async <T>(path: string): Promise<T> => {
      if (!baseUrl) throw new Error("Number Guess API not configured");
      const res = await fetch(`${baseUrl}${path}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
    [baseUrl]
  );

  return { get, enabled: !!baseUrl };
}

function useApiFetch<T>(
  fetchFn: (() => Promise<T>) | null,
  deps: unknown[]
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!fetchFn) {
      setData(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchFn()
      .then((result) => {
        if (!cancelled && mountedRef.current) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled && mountedRef.current) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [...deps, trigger]);

  const refetch = useCallback(() => setTrigger((t) => t + 1), []);

  return { data, isLoading, error, refetch };
}

/**
 * Fetch the active session and its guesses for a token.
 * Returns the playing session (if any) and full guess history.
 */
export function useSessionGuesses(tokenId: string | undefined) {
  const { get, enabled } = useNumberGuessApiClient();

  const fetchFn = useCallback(async () => {
    if (!tokenId || !enabled) return null;

    // Find active (playing) session for this token
    const sessionsRes = await get<PaginatedResponse<ApiGameSession>>(
      `/sessions?token_id=${tokenId}&status=playing&limit=1`
    );

    if (!sessionsRes.data.length) {
      // Check for most recent completed session
      const recentRes = await get<PaginatedResponse<ApiGameSession>>(
        `/sessions?token_id=${tokenId}&limit=1`
      );
      if (!recentRes.data.length) return { session: null, guesses: [] };

      const session = recentRes.data[0];
      const guessesRes = await get<{ data: ApiGuess[] }>(
        `/sessions/${session.id}/guesses`
      );
      return { session, guesses: guessesRes.data };
    }

    const session = sessionsRes.data[0];
    const guessesRes = await get<{ data: ApiGuess[] }>(
      `/sessions/${session.id}/guesses`
    );
    return { session, guesses: guessesRes.data };
  }, [get, enabled, tokenId]);

  return useApiFetch(enabled && tokenId ? fetchFn : null, [tokenId, enabled]);
}

/** Fetch the global leaderboard */
export function useNumberGuessLeaderboard(opts?: {
  limit?: number;
  offset?: number;
  sort?: "score" | "guess_count";
}) {
  const { get, enabled } = useNumberGuessApiClient();

  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const sort = opts?.sort ?? "score";

  const fetchFn = useCallback(async () => {
    return get<{ data: ApiGameSession[]; pagination: { limit: number; offset: number } }>(
      `/leaderboard?limit=${limit}&offset=${offset}&sort=${sort}`
    );
  }, [get, limit, offset, sort]);

  return useApiFetch(enabled ? fetchFn : null, [enabled, limit, offset, sort]);
}

/** Fetch aggregate game stats */
export function useNumberGuessStats() {
  const { get, enabled } = useNumberGuessApiClient();

  const fetchFn = useCallback(async () => {
    return get<ApiGameStats>(`/stats`);
  }, [get]);

  return useApiFetch(enabled ? fetchFn : null, [enabled]);
}

/** Fetch player session history by token ID */
export function usePlayerSessions(
  tokenId: string | undefined,
  opts?: { limit?: number; offset?: number }
) {
  const { get, enabled } = useNumberGuessApiClient();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const fetchFn = useCallback(async () => {
    if (!tokenId) return null;
    return get<ApiPlayerData>(`/players/${tokenId}?limit=${limit}&offset=${offset}`);
  }, [get, tokenId, limit, offset]);

  return useApiFetch(enabled && tokenId ? fetchFn : null, [
    tokenId,
    enabled,
    limit,
    offset,
  ]);
}
