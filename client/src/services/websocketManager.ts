import { config } from "../config";

type MessageHandler = (channel: string, data: any) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, MessageHandler>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subscribedChannels = new Set<string>();

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(config.wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        // Re-subscribe to channels
        if (this.subscribedChannels.size > 0) {
          this.send({
            type: "subscribe",
            channels: [...this.subscribedChannels],
          });
        }
      };

      this.ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.channel && msg.data) {
            this.subscribers.forEach((handler) => handler(msg.channel, msg.data));
          }
        } catch {}
      };

      this.ws.onclose = () => {
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {}
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  subscribe(id: string, handler: MessageHandler) {
    this.subscribers.set(id, handler);
    return () => {
      this.subscribers.delete(id);
    };
  }

  subscribeToChannels(channels: string[], gameIds?: string[]) {
    channels.forEach((ch) => this.subscribedChannels.add(ch));
    this.send({ type: "subscribe", channels, gameIds });
  }

  unsubscribeFromChannels(channels: string[]) {
    channels.forEach((ch) => this.subscribedChannels.delete(ch));
    this.send({ type: "unsubscribe", channels });
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsManager = new WebSocketManager();
