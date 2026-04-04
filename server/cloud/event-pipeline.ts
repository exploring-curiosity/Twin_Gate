import { getPermissionConfig, insertEvent, audit } from "../db.js";
import { detectDistillationAttack } from "../security/validia-detector.js";
import type { OpenClawClient } from "./openclaw-client.js";

export interface PipelineEvent {
  source: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  timestamp: number;
}

export interface PipelineResult {
  event: PipelineEvent;
  filtered: boolean;
  filterReason?: string;
  securityBlocked: boolean;
  securityResult?: ReturnType<typeof detectDistillationAttack>;
  sentToCloud: boolean;
  cloudResponse?: string;
}

type PipelineListener = (result: PipelineResult) => void;

export interface EventPipeline {
  processEvent(event: PipelineEvent): Promise<PipelineResult>;
  onResult(listener: PipelineListener): void;
}

export function createEventPipeline(cloudClient: OpenClawClient): EventPipeline {
  const listeners: PipelineListener[] = [];

  function shouldSendToCloud(
    event: PipelineEvent,
    config: {
      conversations: { allow: string[]; deny: string[] };
      people: { allow: string[]; deny: string[] };
      content: { blocked_topics: string[]; blocked_patterns?: string[] };
      capabilities: { read: boolean };
    }
  ): { allowed: boolean; reason?: string } {
    if (!config.capabilities.read) {
      return { allowed: false, reason: "read capability disabled" };
    }
    if (config.conversations.deny.includes(event.conversation_id)) {
      return { allowed: false, reason: `conversation ${event.conversation_id} denied` };
    }
    if (config.conversations.allow.length > 0 && !config.conversations.allow.includes(event.conversation_id)) {
      return { allowed: false, reason: `conversation ${event.conversation_id} not in allow list` };
    }
    if (config.people.deny.includes(event.sender_id)) {
      return { allowed: false, reason: `sender ${event.sender_id} denied` };
    }
    if (config.people.allow.length > 0 && !config.people.allow.includes(event.sender_id)) {
      return { allowed: false, reason: `sender ${event.sender_id} not in allow list` };
    }
    const lower = event.content.toLowerCase();
    for (const topic of config.content.blocked_topics) {
      if (lower.includes(topic.toLowerCase())) {
        return { allowed: false, reason: `blocked topic: ${topic}` };
      }
    }
    // Check PII patterns
    const patterns = config.content.blocked_patterns || [];
    for (const pattern of patterns) {
      try {
        if (new RegExp(pattern, "i").test(event.content)) {
          return { allowed: false, reason: `blocked pattern: ${pattern}` };
        }
      } catch { /* skip invalid regex */ }
    }

    return { allowed: true };
  }

  return {
    async processEvent(event: PipelineEvent): Promise<PipelineResult> {
      const result: PipelineResult = {
        event,
        filtered: false,
        securityBlocked: false,
        sentToCloud: false,
      };

      // 1. Permission check
      const config = getPermissionConfig(event.source);
      if (config) {
        const check = shouldSendToCloud(event, config);
        if (!check.allowed) {
          result.filtered = true;
          result.filterReason = check.reason;
          insertEvent({
            ...event,
            filtered_out: true,
            sent_to_cloud: false,
          });
          audit("event.filtered", event.source, { reason: check.reason, conversation: event.conversation_id });
          notify(result);
          return result;
        }
      }

      // 2. Validia security check
      const detection = detectDistillationAttack(event.content);
      result.securityResult = detection;
      if (detection.recommendation === "block") {
        result.securityBlocked = true;
        insertEvent({
          ...event,
          filtered_out: true,
          sent_to_cloud: false,
          detection_result: detection,
        });
        audit("event.security_blocked", event.source, {
          signals: detection.signals,
          category: detection.category,
        });
        notify(result);
        return result;
      }

      // 3. Send to cloud
      const cloudResult = await cloudClient.sendEvent(event);
      result.sentToCloud = cloudResult.ok;
      result.cloudResponse = cloudResult.response || cloudResult.error;

      insertEvent({
        ...event,
        filtered_out: false,
        sent_to_cloud: cloudResult.ok,
        detection_result: detection,
      });

      audit("event.processed", event.source, {
        sent_to_cloud: cloudResult.ok,
        security_signals: detection.signals.length,
      });

      notify(result);
      return result;
    },

    onResult(listener: PipelineListener) {
      listeners.push(listener);
    },
  };

  function notify(result: PipelineResult) {
    for (const l of listeners) {
      try { l(result); } catch { /* ignore listener errors */ }
    }
  }
}
