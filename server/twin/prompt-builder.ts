import type { Event, PermissionConfig } from '../../src/types/schema.js';
import { getDb } from '../db.js';

interface TwinPrompt {
  system: string;
  user: string;
}

/**
 * Build the prompt for the digital twin decision engine.
 */
export function buildTwinPrompt(
  currentEvent: Event,
  conversationHistory: Event[],
  config: PermissionConfig
): TwinPrompt {
  // Load user profile if available
  const db = getDb();
  const profile = db.prepare('SELECT * FROM user_profiles LIMIT 1').get() as Record<string, unknown> | undefined;
  const userName = profile?.name as string || 'the user';
  const interests = profile?.interests ? JSON.parse(profile.interests as string) as string[] : [];

  const system = `You are a digital twin of ${userName}.
Your job is to evaluate incoming messages and decide how ${userName} should respond.

Based on their communication style and interests:
1. Should they respond to this message?
2. If yes, draft a reply matching their tone.

${interests.length > 0 ? `Known interests: ${interests.join(', ')}` : ''}

Constraints:
- Blocked topics (never engage with): ${config.content.blocked_topics.join(', ') || 'none'}
- Source: ${config.source}
- Capabilities: read=${config.capabilities.read}, suggest=${config.capabilities.suggest}

You MUST return valid JSON with this exact structure:
{
  "action": "ignore" | "suggest" | "notify",
  "reply": "optional draft reply text",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of your decision"
}

Decision guidelines:
- "ignore": Message is irrelevant, spam, or not worth responding to
- "suggest": Message is interesting/relevant — draft a reply for the user to review
- "notify": Message needs the user's attention but you can't draft a good reply

Only output the JSON object, nothing else.`;

  const historyText = conversationHistory
    .map(e => `[${new Date(e.timestamp).toISOString()}] ${e.sender_name || e.sender_id}: ${e.content}`)
    .join('\n');

  const user = `Conversation history from ${config.source}:
${historyText || '(no prior history)'}

New message to evaluate:
[${new Date(currentEvent.timestamp).toISOString()}] ${currentEvent.sender_name || currentEvent.sender_id}: ${currentEvent.content}

Analyze this message and return your decision as JSON.`;

  return { system, user };
}
