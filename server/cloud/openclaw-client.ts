import type { Event } from '../../src/types/schema.js';
import { getCloudConfig } from '../db.js';

const CLOUD_URL = () => getCloudConfig().url;
const API_KEY = () => getCloudConfig().api_key;

interface CloudResponse {
  status: string;
  event_id?: string;
  decision?: unknown;
  error?: string;
}

/**
 * Send a filtered event to the Cloud OpenClaw instance.
 */
export async function sendToCloud(event: Event): Promise<CloudResponse | null> {
  const url = CLOUD_URL();
  if (!url) {
    console.warn('[cloud] OPENCLAW_CLOUD_URL not configured');
    return null;
  }

  try {
    const response = await fetch(`${url}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY() ? { 'Authorization': `Bearer ${API_KEY()}` } : {}),
      },
      body: JSON.stringify({
        event_id: event.id,
        source: event.source,
        conversation_id: event.conversation_id,
        sender_id: event.sender_id,
        sender_name: event.sender_name,
        content: event.content,
        timestamp: event.timestamp,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[cloud] API responded ${response.status}: ${text}`);
      return { status: 'error', error: `HTTP ${response.status}` };
    }

    const data = await response.json() as CloudResponse;
    console.log(`[cloud] Event ${event.id} sent successfully`);
    return data;
  } catch (err) {
    const error = err as Error;
    if (error.name === 'TimeoutError') {
      console.error('[cloud] Request timed out');
      return { status: 'error', error: 'Timeout' };
    }
    console.error('[cloud] Send failed:', error.message);
    return null;
  }
}

/**
 * Fetch pending decisions from the cloud.
 */
export async function pollDecisions(): Promise<unknown[]> {
  const url = CLOUD_URL();
  if (!url) return [];

  try {
    const response = await fetch(`${url}/api/decisions/pending`, {
      headers: {
        ...(API_KEY() ? { 'Authorization': `Bearer ${API_KEY()}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return [];
    return await response.json() as unknown[];
  } catch {
    return [];
  }
}

/**
 * Send conversation context to the cloud for digital twin processing.
 */
export async function sendTwinContext(context: {
  user_id: string;
  conversation_history: Event[];
  permissions: { blocked_topics: string[] };
}): Promise<unknown | null> {
  const url = CLOUD_URL();
  if (!url) return null;

  try {
    const response = await fetch(`${url}/api/twin/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY() ? { 'Authorization': `Bearer ${API_KEY()}` } : {}),
      },
      body: JSON.stringify(context),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Health check for cloud connection.
 */
export async function checkCloudHealth(): Promise<{ ok: boolean; latency_ms?: number }> {
  const url = CLOUD_URL();
  if (!url) return { ok: false };

  const start = Date.now();
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return { ok: response.ok, latency_ms: Date.now() - start };
  } catch {
    return { ok: false };
  }
}

// ---- OpenClawClient class interface used by the pipeline and routes ----

export interface OpenClawClient {
  healthCheck(): Promise<{ ok: boolean; latency_ms?: number; status: string }>;
  sendEvent(event: {
    source: string;
    conversation_id: string;
    sender_id: string;
    sender_name?: string;
    content: string;
    timestamp: number;
  }): Promise<{ ok: boolean; response?: string; error?: string }>;
  chat(messages: { role: string; content: string }[]): Promise<{ reply: string; error?: string }>;
}

export function createOpenClawClient(): OpenClawClient {
  return {
    async healthCheck() {
      const url = CLOUD_URL();
      if (!url) return { ok: false, status: 'OPENCLAW_CLOUD_URL not configured' };

      const start = Date.now();
      try {
        const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5_000) });
        const latency_ms = Date.now() - start;
        if (!res.ok) return { ok: false, latency_ms, status: `HTTP ${res.status}` };
        return { ok: true, latency_ms, status: 'Connected' };
      } catch (err) {
        return { ok: false, status: (err as Error).message };
      }
    },

    async sendEvent(event) {
      const url = CLOUD_URL();
      if (!url) return { ok: false, error: 'OPENCLAW_CLOUD_URL not configured' };

      try {
        const res = await fetch(`${url}/api/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(API_KEY() ? { Authorization: `Bearer ${API_KEY()}` } : {}),
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          const text = await res.text();
          return { ok: false, error: `HTTP ${res.status}: ${text}` };
        }

        const data = await res.json() as CloudResponse;
        return { ok: true, response: data.event_id || data.status };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },

    async chat(messages) {
      const url = CLOUD_URL();
      if (!url) return { reply: '', error: 'OPENCLAW_CLOUD_URL not configured' };

      try {
        const res = await fetch(`${url}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(API_KEY() ? { Authorization: `Bearer ${API_KEY()}` } : {}),
          },
          body: JSON.stringify({ messages }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!res.ok) return { reply: '', error: `HTTP ${res.status}` };
        const data = await res.json() as { reply?: string; message?: string };
        return { reply: data.reply || data.message || '' };
      } catch (err) {
        return { reply: '', error: (err as Error).message };
      }
    },
  };
}
