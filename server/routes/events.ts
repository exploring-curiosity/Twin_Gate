import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb, getPermissionConfig, insertEvent, getEvents, audit } from '../db.js';
import { screenEvent } from '../middleware/validia.js';
import { sendToCloud } from '../cloud/openclaw-client.js';
import { processTwinDecision } from '../twin/decision-engine.js';
import { broadcast } from '../websocket.js';
import type { Event, PermissionConfig } from '../../src/types/schema.js';

const router = Router();

// POST /api/events — ingest an event
router.post('/', async (req, res) => {
  try {
    const event: Event = {
      id: uuid(),
      ...req.body,
      timestamp: req.body.timestamp || Date.now(),
    };

    const config: PermissionConfig | null = getPermissionConfig(event.source);
    if (!config) {
      res.status(400).json({ error: `No config for source: ${event.source}` });
      return;
    }

    // 1. Validia security screening
    const screenResult = screenEvent(event);
    if (!screenResult.allowed) {
      audit('event.blocked', event.source, {
        signals: screenResult.signals_detected,
        pii: screenResult.pii_detected,
        reason: screenResult.blocked_reason,
      });
      broadcast({ type: 'event_blocked', data: { event_id: event.id, reason: screenResult.blocked_reason, signals: screenResult.signals_detected } });
      res.status(403).json({ blocked: true, reason: screenResult.blocked_reason, signals: screenResult.signals_detected });
      return;
    }

    // 2. Permission rules check
    const permResult = checkPermissions(event, config);
    if (!permResult.allowed) {
      insertEvent({ ...event, filtered_out: true, sent_to_cloud: false });
      res.json({ stored: true, sent_to_cloud: false, reason: permResult.reason });
      return;
    }

    // 3. Send to cloud (standalone mode fallback)
    let cloudSent = false;
    try {
      const cloudResponse = await sendToCloud(event);
      cloudSent = cloudResponse !== null && cloudResponse.status !== 'error';
    } catch (err) {
      console.error('[events] Cloud send failed:', (err as Error).message);
    }

    insertEvent({ ...event, filtered_out: false, sent_to_cloud: cloudSent });

    // 4. Process through digital twin if suggest is enabled
    if (config.capabilities.suggest) {
      processTwinDecision(event, config).catch(err => {
        console.error('[events] Twin decision failed:', (err as Error).message);
      });
    }

    broadcast({ type: 'event_received', data: { event_id: event.id, source: event.source, sent_to_cloud: cloudSent } });
    res.json({ stored: true, sent_to_cloud: cloudSent, event_id: event.id });
  } catch (err) {
    console.error('[events] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function checkPermissions(event: Event, config: PermissionConfig): { allowed: boolean; reason?: string } {
  if (!config.capabilities.read) return { allowed: false, reason: 'read disabled' };
  if (config.conversations.deny.includes(event.conversation_id)) return { allowed: false, reason: 'conversation denied' };
  if (config.conversations.allow.length > 0 && !config.conversations.allow.includes(event.conversation_id)) return { allowed: false, reason: 'conversation not in allow list' };
  if (config.people.deny.includes(event.sender_id)) return { allowed: false, reason: 'sender denied' };
  if (config.people.allow.length > 0 && !config.people.allow.includes(event.sender_id)) return { allowed: false, reason: 'sender not in allow list' };
  const lower = event.content.toLowerCase();
  for (const topic of config.content.blocked_topics) {
    if (lower.includes(topic.toLowerCase())) return { allowed: false, reason: `blocked topic: ${topic}` };
  }
  return { allowed: true };
}

// GET /api/events — list events
router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const source = req.query.source as string | undefined;
  res.json(getEvents(limit, offset, source));
});

// GET /api/events/blocked — list blocked events (now uses audit_log)
router.get('/blocked', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = getDb()
    .prepare("SELECT * FROM audit_log WHERE action LIKE 'event.blocked%' ORDER BY timestamp DESC LIMIT ?")
    .all(limit);
  res.json(rows);
});

// GET /api/events/:id/decision — get decision for an event
router.get('/:id/decision', (req, res) => {
  const decision = getDb().prepare('SELECT * FROM decisions WHERE event_id = ?').get(req.params.id);
  if (!decision) {
    res.status(404).json({ error: 'No decision for this event' });
    return;
  }
  res.json(decision);
});

export default router;
