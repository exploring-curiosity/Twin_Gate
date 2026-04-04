export type IntegrationSource =
  | "discord"
  | "slack"
  | "gmail"
  | "google_calendar"
  | "linkedin"
  | "telegram"
  | "twitter";

export interface PermissionConfig {
  source: IntegrationSource;

  conversations: {
    allow: string[];
    deny: string[];
  };

  people: {
    allow: string[];
    deny: string[];
  };

  content: {
    blocked_topics: string[];
    blocked_patterns: string[];
  };

  capabilities: {
    read: boolean;
    suggest: boolean;
    auto_reply: boolean;
  };
}

export interface Event {
  id?: string;
  source: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Decision {
  id?: string;
  event_id: string;
  action: "ignore" | "suggest" | "auto_reply";
  reply?: string;
  confidence: number;
  reasoning: string;
  created_at?: number;
}

export interface DetectionResult {
  isAttack: boolean;
  confidence: number;
  signals: string[];
  category: string | null;
  recommendation: "allow" | "flag" | "block";
  pii_detected: string[];
}

export interface IntegrationStatus {
  source: IntegrationSource;
  connected: boolean;
  authenticated: boolean;
  last_event_at?: number;
  error?: string;
}

export interface GroupChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  timestamp: number;
  is_agent: boolean;
  agent_owner?: string;
  decision?: Decision;
}

export interface AgentProfile {
  user_id: string;
  display_name: string;
  skills: string[];
  interests: string[];
  employer?: string;
  location?: string;
  communication_style?: string;
}

export interface AgentResponse {
  user_id: string;
  user_name: string;
  action: "interested" | "unavailable" | "maybe" | "ignored";
  message?: string;
  confidence: number;
}

export interface OAuthStatus {
  provider: string;
  connected: boolean;
  scope?: string;
  expires_at?: string;
}

export interface ValidiaScreenResult {
  allowed: boolean;
  threat_level: 'none' | 'medium' | 'high' | 'critical';
  signals_detected: string[];
  pii_detected: string[];
  blocked_reason?: string;
}
