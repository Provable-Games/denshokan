import { useCallback } from "react";
import { useSubscription } from "@provable-games/denshokan-sdk/react";
import type { WSChannel, WSMessage } from "@provable-games/denshokan-sdk";

interface UseWebSocketOptions {
  channels?: string[];
  gameIds?: string[];
  onMessage?: (channel: string, data: any) => void;
  autoConnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { channels = [], gameIds, onMessage } = options;

  const handler = useCallback(
    (message: WSMessage) => {
      onMessage?.(message.channel, message.data);
    },
    [onMessage],
  );

  useSubscription(
    channels as WSChannel[],
    handler,
    gameIds?.map(Number),
  );

  return { connected: true };
}
