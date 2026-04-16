import { useEffect, useRef, useState } from "react";
import { useChainConfig } from "../contexts/NetworkContext";
import type {
  WsChannel,
  WsMessage,
  WsGuessPayload,
  WsGameEndPayload,
  WsNewGamePayload,
} from "./numberGuessApi.types";

// Module-level dedup set shared across all hook instances
const seenMessages = new Set<string>();

export interface UseNumberGuessWebSocketOptions {
  channels: WsChannel[];
  tokenId?: string;
  onGuess?: (data: WsGuessPayload) => void | Promise<void>;
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
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);


  // Store all mutable values in refs so the effect doesn't need to re-run
  const callbacksRef = useRef({ onGuess, onGameWon, onGameLost, onNewGame });
  callbacksRef.current = { onGuess, onGameWon, onGameLost, onNewGame };

  const tokenIdRef = useRef(tokenId);
  tokenIdRef.current = tokenId;

  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  // Only reconnect when wsUrl or enabled changes
  useEffect(() => {
    if (!wsUrl || !enabled) {
      console.log(`[NumberGuessWS] skipping connect: wsUrl=${wsUrl ? "set" : "empty"}, enabled=${enabled}`);
      return;
    }

    let disposed = false;

    function connect() {
      if (disposed) return;

      // Clean up existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      console.log(`[NumberGuessWS] connecting to ${wsUrl}...`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) { ws.close(); return; }
        const chs = channelsRef.current;
        console.log(`[NumberGuessWS] connected, subscribing to [${chs.join(", ")}]`);
        setIsConnected(true);
        retryCountRef.current = 0;
        ws.send(JSON.stringify({ type: "subscribe", channels: chs }));
      };

      ws.onmessage = (evt) => {
        try {
          const msg: WsMessage = JSON.parse(evt.data);
          if (!msg.channel || !msg.data) return;

          // Deduplicate: use serverTs + channel as key (shared across all instances)
          const dedupeKey = `${msg.channel}:${msg._timing?.serverTs}`;
          if (seenMessages.has(dedupeKey)) return;
          seenMessages.add(dedupeKey);
          if (seenMessages.size > 100) {
            const first = seenMessages.values().next().value;
            if (first) seenMessages.delete(first);
          }

          console.log(`[NumberGuessWS] message:`, msg);

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

      ws.onclose = (evt) => {
        console.log(`[NumberGuessWS] closed: code=${evt.code} reason=${evt.reason}`);
        setIsConnected(false);
        wsRef.current = null;

        if (disposed) return;

        const delay = Math.min(1000 * 2 ** retryCountRef.current, 30000);
        retryCountRef.current++;
        console.log(`[NumberGuessWS] reconnecting in ${delay}ms (attempt ${retryCountRef.current})`);
        retryTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = (err) => {
        console.error(`[NumberGuessWS] error:`, err);
      };
    }

    connect();

    return () => {
      disposed = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [wsUrl, enabled]);

  return { isConnected };
}
