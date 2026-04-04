import { getDb } from '../db.js';
import { checkAvailability, parseTimeReference } from '../integrations/calendar.js';
import { matchInterests, isAvailabilityQuery, isReferralRequest, isSkillRequest } from './interest-matching.js';
import type { Event, AgentResponse, PermissionConfig, IntegrationSource } from '../../src/types/schema.js';

interface UserContext {
  userId: string;
  userName: string;
  interests: string[];
  location?: string;
  timezone?: string;
  event: Event;
}

/**
 * Evaluate a social message on behalf of a specific user.
 * Checks permissions, interests, and calendar availability.
 */
export async function evaluateForUser(ctx: UserContext): Promise<AgentResponse | null> {
  const { userId, userName, interests, event } = ctx;

  // 1. Permission check — is this user allowed to see events from this source?
  const config = getUserPermissionConfig(event.source);
  if (!config || !config.capabilities.read) {
    return null;
  }

  // Check conversation/people deny lists
  if (config.conversations.deny.includes(event.conversation_id)) return null;
  if (config.people.deny.includes(event.sender_id)) return null;

  // 2. Interest matching
  const interestMatch = matchInterests(event.content, interests);

  // 3. Availability check if it's a time-based query
  let calendarFree = true;
  let calendarChecked = false;
  if (isAvailabilityQuery(event.content)) {
    const timeRange = parseTimeReference(event.content);
    if (timeRange) {
      const availability = await checkAvailability(timeRange.start, timeRange.end);
      calendarFree = availability.free;
      calendarChecked = true;
    }
  }

  // 4. Determine action based on scoring
  const isReferral = isReferralRequest(event.content);
  const isSkill = isSkillRequest(event.content);

  // Score the message relevance
  let relevanceScore = interestMatch.score;
  if (isReferral) relevanceScore += 0.3;
  if (isSkill) relevanceScore += 0.2;
  if (isAvailabilityQuery(event.content)) relevanceScore += 0.15;
  relevanceScore = Math.min(1.0, relevanceScore);

  // Decide action
  if (relevanceScore < 0.2) {
    return null; // Not relevant enough
  }

  if (relevanceScore < 0.4) {
    return {
      user_id: userId,
      user_name: userName,
      action: 'ignored',
      confidence: relevanceScore,
    };
  }

  // Build response message
  const parts: string[] = [];
  if (calendarChecked) {
    parts.push(calendarFree ? 'is free' : 'has conflicts');
  }
  if (interestMatch.matched_interests.length > 0) {
    parts.push(`interested in ${interestMatch.matched_interests.join(', ')}`);
  }
  if (isReferral) {
    parts.push('may be able to help with referral');
  }
  if (isSkill && interestMatch.matched_categories.length > 0) {
    parts.push(`has experience in ${interestMatch.matched_categories.join(', ')}`);
  }

  const message = parts.length > 0
    ? `${userName}'s agent says they ${parts.join(' and ')}`
    : undefined;

  // Determine action
  let action: AgentResponse['action'];
  if (calendarChecked && calendarFree && relevanceScore >= 0.5) {
    action = 'interested';
  } else if (calendarChecked && !calendarFree) {
    action = 'unavailable';
  } else if (relevanceScore >= 0.5) {
    action = 'interested';
  } else {
    action = 'maybe';
  }

  return {
    user_id: userId,
    user_name: userName,
    action,
    message,
    confidence: relevanceScore,
  };
}

function getUserPermissionConfig(source: string): PermissionConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM permission_configs WHERE source = ?').get(source) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    source: row.source as IntegrationSource,
    conversations: {
      allow: JSON.parse(row.conversations_allow as string),
      deny: JSON.parse(row.conversations_deny as string),
    },
    people: {
      allow: JSON.parse(row.people_allow as string),
      deny: JSON.parse(row.people_deny as string),
    },
    content: { blocked_topics: JSON.parse(row.blocked_topics as string), blocked_patterns: [] },
    capabilities: {
      read: Boolean(row.read_access),
      suggest: Boolean(row.suggest_access),
      auto_reply: Boolean(row.auto_reply_access),
    },
  };
}
