/**
 * HTTP client for the /emotion endpoint.
 *
 * Converts audio Blobs to base64, POSTs them with the last 10 messages of
 * conversation history, and dispatches parsed emotion results to the registered
 * callback.
 *
 * Mobile-resilience features:
 *   - AbortController timeout (8s) prevents hung requests from piling up
 *   - 1 automatic retry with backoff on network failure
 *   - "Latest wins" concurrency: a new request aborts any in-flight request so
 *     the orb always reacts to the most recent utterance
 *
 * Endpoint resolution (in priority order):
 *   1. VITE_API_URL env var  — set to Supabase Edge Function URL in production
 *   2. http://<hostname>:3001/emotion  — local Node.js dev server
 */
import type { EmotionAnalysis, StoredMessage } from './types';

const API_URL =
  import.meta.env.VITE_API_URL ??
  `http://${window.location.hostname || 'localhost'}:3001/emotion`;

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 600;

/**
 * Fire-and-forget OPTIONS request to wake a cold Supabase Edge Function.
 * Only called on mobile where cold starts cause noticeable latency.
 */
export function warmupApi() {
  fetch(API_URL, { method: 'OPTIONS' }).catch(() => {});
}

export type EmotionCallback = (text: string, emotion: EmotionAnalysis) => void;

export class ApiClient {
  private onEmotion: EmotionCallback | null = null;
  private inflight: AbortController | null = null;
  private destroyed = false;

  connect(onEmotion: EmotionCallback) {
    this.onEmotion = onEmotion;
  }

  async sendAudio(blob: Blob, history: StoredMessage[], mimeType?: string) {
    if (this.destroyed) return;

    // Abort any previous in-flight request so we always process the latest utterance
    this.inflight?.abort();

    const controller = new AbortController();
    this.inflight = controller;

    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const base64 = await blobToBase64(blob);
      const body = JSON.stringify({
        audio: base64,
        mimeType: mimeType || blob.type || 'audio/webm',
        history: history.slice(-10).map((m) => ({
          text: m.text,
          timestamp: m.timestamp,
        })),
      });

      const data = await this.fetchWithRetry(body, controller.signal);
      if (data?.text && data?.emotion) {
        this.onEmotion?.(data.text, data.emotion);
      }
    } catch {
      /* aborted, timed out, or network failure after retries */
    } finally {
      clearTimeout(timeout);
      if (this.inflight === controller) this.inflight = null;
    }
  }

  private async fetchWithRetry(
    body: string,
    signal: AbortSignal,
  ): Promise<{ text?: string; emotion?: EmotionAnalysis } | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal.aborted) return null;
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal,
        });
        if (!res.ok) return null;
        return await res.json();
      } catch (err: unknown) {
        if (signal.aborted) return null;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    return null;
  }

  destroy() {
    this.destroyed = true;
    this.inflight?.abort();
    this.inflight = null;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
