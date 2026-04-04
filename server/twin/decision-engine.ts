import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db.js';
import { broadcast } from '../websocket.js';
import { buildTwinPrompt } from './prompt-builder.js';
import type { Event, Decision, PermissionConfig } from '../../src/types/schema.js';

let anthropic: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

/**
 * Process an event through the digital twin decision engine.
 * Uses Anthropic Claude to evaluate whether the user should respond.
 */
export async function processTwinDecision(
  event: Event,
  config: PermissionConfig
): Promise<Decision | null> {
  const client = getClient();
  if (!client) {
    console.warn('[twin] ANTHROPIC_API_KEY not configured, skipping decision');
    return null;
  }

  const db = getDb();

  // Get recent conversation history for context
  const recentEvents = db.prepare(`
    SELECT * FROM events
    WHERE conversation_id = ? AND source = ?
    ORDER BY timestamp DESC LIMIT 10
  `).all(event.conversation_id, event.source) as Event[];

  // Build the twin prompt
  const { system, user: userPrompt } = buildTwinPrompt(event, recentEvents.reverse(), config);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Parse the response
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    const decision = parseDecision(text, event.id!);

    // Store decision
    db.prepare(`
      INSERT INTO decisions (id, event_id, action, reply, confidence, reasoning, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(decision.id, decision.event_id, decision.action, decision.reply || null, decision.confidence, decision.reasoning, Date.now());

    // Notify frontend
    broadcast({
      type: 'decision',
      data: decision,
    });

    console.log(`[twin] Decision for event ${event.id}: ${decision.action} (confidence: ${decision.confidence})`);
    return decision;
  } catch (err) {
    console.error('[twin] Decision engine error:', (err as Error).message);
    return null;
  }
}

function parseDecision(text: string, eventId: string): Decision {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        id: uuid(),
        event_id: eventId,
        action: validateAction(parsed.action),
        reply: parsed.reply || undefined,
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch {
      // Fall through to default
    }
  }

  // Default: suggest with the full response as reasoning
  return {
    id: uuid(),
    event_id: eventId,
    action: 'suggest',
    confidence: 0.5,
    reasoning: text.slice(0, 500),
  };
}

function validateAction(action: string): Decision['action'] {
  if (action === 'ignore' || action === 'suggest' || action === 'auto_reply') {
    return action;
  }
  return 'suggest';
}
