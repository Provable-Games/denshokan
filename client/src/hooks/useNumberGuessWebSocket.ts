import { useEffect, useRef, useState, useCallback } from "react";
import { useChainConfig } from "../contexts/NetworkContext";
import type {
  WsChannel,
  WsMessage,
  WsGuessPayload,
  WsGameEndPayload,
  WsNewGamePayload,
} from "./numberGuessApi.types";

export interface UseNumberGuessWebSocketOptions {
  channels: WsChannel[];
  tokenId?: string;
  onGuess?: (data: WsGuessPayload) => void;
  onGameWon?: (data: WsGameEndPayload) => void;
  onGameLost?: (data: WsGameEndPayload) => void;
  onNewGame?: (data: WsNewGamePayload) => void;
  enabled?: boolean;
}

export function useNumberGuessWebSocket(
  options: UseNumberGuessWebSocketOptions
) {
  const { chainConfig } = useChainConfig();
  const wsUrl = chainConfig.numberGuessWsUrl;
  const {
    channels,
    tokenId,
    onGuess,
    onGameWon,
    onGameLost,
    onNewGame,
    enabled = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Store latest callbacks in refs to avoid reconnecting on callback changes
  const callbacksRef = useRef({ onGuess, onGameWon, onGameLost, onNewGame });
  callbacksRef.current = { onGuess, onGameWon, onGameLost, onNewGame };

  const tokenIdRef = useRef(tokenId);
  tokenIdRef.current = tokenId;

  const connect = useCallback(() => {
    if (!wsUrl || !enabled || channels.length === 0) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      retryCountRef.current = 0;
      // Subscribe to requested channels
      ws.send(JSON.stringify({ type: "subscribe", channels }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg: WsMessage = JSON.parse(evt.data);
        if (!msg.channel || !msg.data) return;

        // Filter by tokenId if specified
        const payload = msg.data as { tokenId?: string };
        if (tokenIdRef.current && payload.tokenId && payload.tokenId !== tokenIdRef.current) {
          return;
        }

        switch (msg.channel) {
          case "guess":
            callbacksRef.current.onGuess?.(msg.data as WsGuessPayload);
            break;
          case "game_won":
            callbacksRef.current.onGameWon?.(msg.data as WsGameEndPayload);
            break;
          case "game_lost":
            callbacksRef.current.onGameLost?.(msg.data as WsGameEndPayload);
            break;
          case "new_game":
            callbacksRef.current.onNewGame?.(msg.data as WsNewGamePayload);
            break;
        }
      } catch {
        // Ignore malformed messages (e.g. "subscribed" confirmations)
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      if (!enabled) return;

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
      const delay = Math.min(1000 * 2 ** retryCountRef.current, 30000);
      retryCountRef.current++;
      retryTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };
  }, [wsUrl, enabled, channels.join(",")]);

  useEffect(() => {
    connect();

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [connect]);

  return { isConnected };
}
