import { useEffect, useRef } from "react";
import { wsManager } from "../services/websocketManager";

interface UseWebSocketOptions {
  channels?: string[];
  gameIds?: string[];
  onMessage?: (channel: string, data: any) => void;
  autoConnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { channels = [], gameIds, onMessage, autoConnect = true } = options;
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  const subscriberId = useRef(`ws-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const unsub = wsManager.subscribe(subscriberId.current, (channel, data) => {
      callbackRef.current?.(channel, data);
    });

    if (channels.length > 0) {
      wsManager.subscribeToChannels(channels, gameIds);
    }

    if (autoConnect) {
      wsManager.connect();
    }

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (channels.length > 0) {
      wsManager.subscribeToChannels(channels, gameIds);
    }
  }, [channels.join(","), gameIds?.join(",")]);

  return { connected: wsManager.connected };
}
