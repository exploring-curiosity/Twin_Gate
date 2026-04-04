import { getDb } from '../db.js';
import { pollDecisions, checkCloudHealth } from './openclaw-client.js';
import { broadcast } from '../websocket.js';
import type { Decision } from '../../src/types/schema.js';
import { v4 as uuid } from 'uuid';

let syncInterval: ReturnType<typeof setInterval> | null = null;
let isCloudConnected = false;
let cloudLatency: number | undefined;

/**
 * Start bidirectional sync with Cloud OpenClaw.
 * Polls for decisions and syncs state.
 */
export function startCloudSync(intervalMs: number = 15_000) {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(async () => {
    // Health check
    const health = await checkCloudHealth();
    const wasConnected = isCloudConnected;
    isCloudConnected = health.ok;
    cloudLatency = health.latency_ms;

    if (wasConnected !== isCloudConnected) {
      broadcast({ type: 'cloud_status', data: { connected: isCloudConnected, latency_ms: cloudLatency } });
    }

    if (!isCloudConnected) return;

    // Poll for decisions
    try {
      const decisions = await pollDecisions();
      if (Array.isArray(decisions) && decisions.length > 0) {
        const db = getDb();
        const insert = db.prepare(`
          INSERT OR IGNORE INTO decisions (id, event_id, action, reply, confidence, reasoning, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const raw of decisions) {
          const d = raw as Decision;
          const id = d.id || uuid();
          insert.run(id, d.event_id, d.action, d.reply || null, d.confidence, d.reasoning, Date.now());

          broadcast({
            type: 'decision',
            data: { id, event_id: d.event_id, action: d.action, reply: d.reply, confidence: d.confidence, reasoning: d.reasoning },
          });
        }
      }
    } catch (err) {
      console.error('[sync] Decision poll failed:', (err as Error).message);
    }
  }, intervalMs);

  console.log(`[sync] Cloud sync started (every ${intervalMs / 1000}s)`);
}

export function stopCloudSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export function getCloudSyncStatus() {
  return {
    connected: isCloudConnected,
    latency_ms: cloudLatency,
    syncing: syncInterval !== null,
  };
}
