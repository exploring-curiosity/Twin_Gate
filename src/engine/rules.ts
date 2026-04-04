import type { Event, PermissionConfig } from '../types/schema';

/**
 * Evaluates whether an event should be sent to the cloud based on the user's local permission configuration.
 * This acts as the primary privacy firewall.
 * 
 * @param event The raw event from an integration source
 * @param config The permission configuration for that source
 * @returns boolean True if the event is allowed to be sent to the cloud, false otherwise
 */
export function shouldSendToCloud(event: Event, config: PermissionConfig): boolean {
  // 1. Check capabilities first
  if (!config.capabilities.read) {
    return false;
  }

  // 2. Deny specific conversations (Channels/Groups/DMs)
  if (config.conversations.deny.includes(event.conversation_id)) {
    return false;
  }

  // 3. Allow specific conversations (If allow list is not empty, only allow those)
  if (config.conversations.allow.length > 0 && !config.conversations.allow.includes(event.conversation_id)) {
    return false;
  }

  // 4. Deny specific people (Senders)
  if (config.people.deny.includes(event.sender_id)) {
    return false;
  }

  // 5. Allow specific people (If allow list is not empty, only allow those)
  if (config.people.allow && config.people.allow.length > 0 && !config.people.allow.includes(event.sender_id)) {
    return false;
  }

  // 6. Block specific topics (Content filtering)
  const lowerContent = event.content.toLowerCase();
  for (const topic of config.content.blocked_topics) {
    if (lowerContent.includes(topic.toLowerCase())) {
      return false; // Drop message if it contains a blocked topic
    }
  }

  // If it passes all checks, it's safe to send
  return true;
}
