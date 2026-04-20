/**
 * WebSocket client for the /emotion endpoint (alternative transport).
 *
 * This module implements the same interface as ApiClient but uses a persistent
 * WebSocket connection with exponential-backoff reconnection. The Node.js server
 * at server/index.ts exposes the same endpoint over WebSocket.
 *
 * NOTE: The default UI uses ApiClient (HTTP) instead. Switch to this client by
 * importing WsClient in App.tsx and setting VITE_WS_URL to your server's
 * wss:// address.
 */
import type { EmotionAnalysis, StoredMessage } from './types';

// In production set VITE_WS_URL=wss://your-server.railway.app in Vercel env vars
const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname || 'localhost'}:3001`;
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

export type EmotionCallback = (text: string, emotion: EmotionAnalysis) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private onEmotion: EmotionCallback | null = null;
  private reconnectDelay = RECONNECT_DELAY_MS;
  private destroyed = false;

  connect(onEmotion: EmotionCallback) {
    this.onEmotion = onEmotion;
    this.open();
  }

  private open() {
    if (this.destroyed) return;
    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = RECONNECT_DELAY_MS;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.text && data.emotion && this.onEmotion) {
          this.onEmotion(data.text, data.emotion);
        }
      } catch { /* ignore malformed messages */ }
    };

    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onerror = () => this.ws?.close();
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    setTimeout(() => this.open(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS);
  }

  sendAudio(blob: Blob, history: StoredMessage[], mimeType?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const mime = mimeType || blob.type || 'audio/webm';
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      this.ws?.send(
        JSON.stringify({
          audio: base64,
          mimeType: mime,
          history: history.slice(-10).map((m) => ({
            text: m.text,
            timestamp: m.timestamp,
          })),
        })
      );
    };
    reader.readAsDataURL(blob);
  }

  destroy() {
    this.destroyed = true;
    this.ws?.close();
    this.ws = null;
  }
}
