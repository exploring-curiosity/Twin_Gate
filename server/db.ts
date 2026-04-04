import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.ZEROCLAW_DB_PATH || "./data/zeroclaw.sqlite";
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initTables(db);
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database.Database) {
  // Add columns introduced after initial schema
  const migrations = [
    "ALTER TABLE accounts ADD COLUMN openclaw_url TEXT",
    "ALTER TABLE accounts ADD COLUMN openclaw_api_key TEXT",
  ];
  for (const m of migrations) {
    try { db.exec(m); } catch { /* column already exists */ }
  }
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS permission_configs (
      source TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      filtered_out INTEGER DEFAULT 0,
      sent_to_cloud INTEGER DEFAULT 0,
      cloud_response TEXT,
      detection_result TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      source TEXT,
      payload TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      provider TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      token_type TEXT,
      expiry TEXT,
      scope TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT,
      content TEXT NOT NULL,
      is_user INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_history_conv ON conversation_history(conversation_id);

    CREATE TABLE IF NOT EXISTS agent_profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT,
      skills TEXT DEFAULT '[]',
      interests TEXT DEFAULT '[]',
      employer TEXT,
      location TEXT,
      communication_style TEXT,
      profile_json TEXT DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS room_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_agent INTEGER DEFAULT 0,
      agent_owner TEXT,
      decision_json TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

    CREATE INDEX IF NOT EXISTS idx_room_messages ON room_messages(room_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS security_threats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      content TEXT NOT NULL,
      detection_json TEXT NOT NULL,
      action_taken TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS twin_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER,
      source TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      original_message TEXT NOT NULL,
      suggested_reply TEXT NOT NULL,
      confidence REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      openclaw_url TEXT,
      openclaw_api_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      content TEXT NOT NULL,
      is_twin_response INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dm_participants ON direct_messages(from_id, to_id);
  `);
}

// --- Permission Config helpers ---

export function getPermissionConfig(source: string) {
  const row = getDb()
    .prepare("SELECT config_json FROM permission_configs WHERE source = ?")
    .get(source) as { config_json: string } | undefined;
  return row ? JSON.parse(row.config_json) : null;
}

export function getAllPermissionConfigs() {
  const rows = getDb()
    .prepare("SELECT source, config_json FROM permission_configs")
    .all() as { source: string; config_json: string }[];
  const configs: Record<string, unknown> = {};
  for (const row of rows) {
    configs[row.source] = JSON.parse(row.config_json);
  }
  return configs;
}

export function upsertPermissionConfig(source: string, config: unknown) {
  getDb()
    .prepare(
      `INSERT INTO permission_configs (source, config_json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(source) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`
    )
    .run(source, JSON.stringify(config));
  audit("permission.updated", source, { source });
}

// --- Event helpers ---

export function insertEvent(event: {
  source: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  timestamp: number;
  filtered_out: boolean;
  sent_to_cloud: boolean;
  detection_result?: unknown;
}) {
  const result = getDb()
    .prepare(
      `INSERT INTO events (source, conversation_id, sender_id, sender_name, content, timestamp, filtered_out, sent_to_cloud, detection_result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.source,
      event.conversation_id,
      event.sender_id,
      event.sender_name || null,
      event.content,
      event.timestamp,
      event.filtered_out ? 1 : 0,
      event.sent_to_cloud ? 1 : 0,
      event.detection_result ? JSON.stringify(event.detection_result) : null
    );
  return result.lastInsertRowid;
}

export function getEvents(limit = 50, offset = 0, source?: string) {
  const where = source ? "WHERE source = ?" : "";
  const params = source ? [source, limit, offset] : [limit, offset];
  return getDb()
    .prepare(`SELECT * FROM events ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...params);
}

// --- Audit helpers ---

export function audit(action: string, source: string | null, payload: unknown = {}) {
  getDb()
    .prepare("INSERT INTO audit_log (action, source, payload) VALUES (?, ?, ?)")
    .run(action, source, JSON.stringify(payload));
}

// --- OAuth helpers ---

export function getOAuthToken(provider: string) {
  return getDb()
    .prepare("SELECT * FROM oauth_tokens WHERE provider = ?")
    .get(provider) as Record<string, string> | undefined;
}

export function upsertOAuthToken(provider: string, tokens: {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expiry?: string;
  scope?: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO oauth_tokens (provider, access_token, refresh_token, token_type, expiry, scope, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(provider) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
         token_type = excluded.token_type,
         expiry = excluded.expiry,
         scope = excluded.scope,
         updated_at = excluded.updated_at`
    )
    .run(
      provider,
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.token_type || "Bearer",
      tokens.expiry || null,
      tokens.scope || null
    );
}

export function deleteOAuthToken(provider: string) {
  getDb().prepare("DELETE FROM oauth_tokens WHERE provider = ?").run(provider);
}

// --- Conversation History ---

export function insertConversationMessage(msg: {
  source: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  content: string;
  is_user: boolean;
  timestamp: number;
}) {
  getDb()
    .prepare(
      `INSERT INTO conversation_history (source, conversation_id, sender_id, sender_name, content, is_user, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(msg.source, msg.conversation_id, msg.sender_id, msg.sender_name || null, msg.content, msg.is_user ? 1 : 0, msg.timestamp);
}

export function getConversationHistory(conversationId: string, limit = 50) {
  return getDb()
    .prepare("SELECT * FROM conversation_history WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?")
    .all(conversationId, limit);
}

// --- Agent Profiles ---

export function getAgentProfile(userId: string) {
  const row = getDb()
    .prepare("SELECT * FROM agent_profiles WHERE user_id = ?")
    .get(userId) as Record<string, string> | undefined;
  if (!row) return null;
  return {
    ...row,
    skills: JSON.parse(row.skills || "[]"),
    interests: JSON.parse(row.interests || "[]"),
  };
}

export function getAllAgentProfiles(): {
  user_id: string;
  display_name: string;
  skills: string[];
  interests: string[];
  employer?: string;
  location?: string;
  communication_style?: string;
}[] {
  const rows = getDb().prepare("SELECT * FROM agent_profiles").all() as Record<string, string>[];
  return rows.map((r) => ({
    user_id: r.user_id,
    display_name: r.display_name,
    skills: JSON.parse(r.skills || "[]"),
    interests: JSON.parse(r.interests || "[]"),
    employer: r.employer || undefined,
    location: r.location || undefined,
    communication_style: r.communication_style || undefined,
  }));
}

export function upsertAgentProfile(profile: {
  user_id: string;
  display_name: string;
  skills: string[];
  interests: string[];
  employer?: string;
  location?: string;
  communication_style?: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO agent_profiles (user_id, display_name, skills, interests, employer, location, communication_style, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         skills = excluded.skills,
         interests = excluded.interests,
         employer = excluded.employer,
         location = excluded.location,
         communication_style = excluded.communication_style,
         updated_at = excluded.updated_at`
    )
    .run(
      profile.user_id,
      profile.display_name,
      JSON.stringify(profile.skills),
      JSON.stringify(profile.interests),
      profile.employer || null,
      profile.location || null,
      profile.communication_style || null
    );
}

// --- Rooms ---

export function createRoom(id: string, name: string, description: string, createdBy: string) {
  getDb()
    .prepare("INSERT INTO rooms (id, name, description, created_by) VALUES (?, ?, ?, ?)")
    .run(id, name, description, createdBy);
}

export function getRooms() {
  return getDb().prepare("SELECT * FROM rooms ORDER BY created_at DESC").all();
}

export function insertRoomMessage(msg: {
  room_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_agent: boolean;
  agent_owner?: string;
  decision_json?: string;
  timestamp: number;
}) {
  return getDb()
    .prepare(
      `INSERT INTO room_messages (room_id, sender_id, sender_name, content, is_agent, agent_owner, decision_json, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      msg.room_id,
      msg.sender_id,
      msg.sender_name,
      msg.content,
      msg.is_agent ? 1 : 0,
      msg.agent_owner || null,
      msg.decision_json || null,
      msg.timestamp
    );
}

export function getRoomMessages(roomId: string, limit = 100) {
  return getDb()
    .prepare("SELECT * FROM room_messages WHERE room_id = ? ORDER BY timestamp ASC LIMIT ?")
    .all(roomId, limit);
}

// --- Twin Suggestions ---

export function insertTwinSuggestion(s: {
  event_id?: number;
  source: string;
  conversation_id: string;
  original_message: string;
  suggested_reply: string;
  confidence: number;
}) {
  return getDb()
    .prepare(
      `INSERT INTO twin_suggestions (event_id, source, conversation_id, original_message, suggested_reply, confidence)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(s.event_id || null, s.source, s.conversation_id, s.original_message, s.suggested_reply, s.confidence);
}

export function getPendingSuggestions() {
  return getDb()
    .prepare("SELECT * FROM twin_suggestions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50")
    .all();
}

export function updateSuggestionStatus(id: number, status: "approved" | "rejected" | "sent") {
  getDb().prepare("UPDATE twin_suggestions SET status = ? WHERE id = ?").run(status, id);
}

// --- Accounts ---

export interface Account {
  id: string;
  name: string;
  email?: string;
  openclaw_url?: string;
  openclaw_api_key?: string;
  created_at: string;
}

export function createAccount(id: string, name: string) {
  getDb()
    .prepare("INSERT INTO accounts (id, name) VALUES (?, ?)")
    .run(id, name);
}

export function setAccountOpenClaw(id: string, url: string, api_key: string) {
  getDb()
    .prepare("UPDATE accounts SET openclaw_url = ?, openclaw_api_key = ? WHERE id = ?")
    .run(url || null, api_key || null, id);
}

export function getAccounts(): Account[] {
  return getDb().prepare("SELECT * FROM accounts ORDER BY created_at ASC").all() as Account[];
}

export function getAccount(id: string): Account | undefined {
  return getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Account | undefined;
}

export function updateAccount(id: string, name: string) {
  getDb().prepare("UPDATE accounts SET name = ? WHERE id = ?").run(name, id);
}

export function deleteAccount(id: string) {
  getDb().prepare("DELETE FROM accounts WHERE id = ?").run(id);
}

// --- Direct Messages ---

export interface DirectMessage {
  id: number;
  from_id: string;
  to_id: string;
  content: string;
  is_twin_response: number;
  created_at: string;
}

export function insertDirectMessage(msg: { from_id: string; to_id: string; content: string; is_twin_response: boolean }) {
  return getDb()
    .prepare("INSERT INTO direct_messages (from_id, to_id, content, is_twin_response) VALUES (?, ?, ?, ?)")
    .run(msg.from_id, msg.to_id, msg.content, msg.is_twin_response ? 1 : 0).lastInsertRowid;
}

export function getDirectMessages(accountA: string, accountB: string, limit = 100): DirectMessage[] {
  return getDb()
    .prepare(`SELECT * FROM direct_messages
              WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)
              ORDER BY created_at ASC LIMIT ?`)
    .all(accountA, accountB, accountB, accountA, limit) as DirectMessage[];
}

export function getMessageThreads(accountId: string): { other_id: string; last_message: string; last_at: string }[] {
  return getDb()
    .prepare(`SELECT
        CASE WHEN from_id = ? THEN to_id ELSE from_id END as other_id,
        content as last_message,
        MAX(created_at) as last_at
      FROM direct_messages
      WHERE from_id = ? OR to_id = ?
      GROUP BY other_id
      ORDER BY last_at DESC`)
    .all(accountId, accountId, accountId) as { other_id: string; last_message: string; last_at: string }[];
}

// --- Cloud Config ---

export function getCloudConfig(): { url: string; api_key: string } {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  const url = (db.prepare("SELECT value FROM cloud_config WHERE key = 'url'").get() as { value: string } | undefined)?.value || process.env.OPENCLAW_CLOUD_URL || '';
  const api_key = (db.prepare("SELECT value FROM cloud_config WHERE key = 'api_key'").get() as { value: string } | undefined)?.value || process.env.OPENCLAW_API_KEY || '';
  return { url, api_key };
}

export function setCloudConfig(url: string, api_key: string) {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS cloud_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.prepare("INSERT INTO cloud_config (key, value) VALUES ('url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(url);
  db.prepare("INSERT INTO cloud_config (key, value) VALUES ('api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(api_key);
}

// --- Security Threats ---

export function insertSecurityThreat(threat: {
  source: string;
  content: string;
  detection_json: unknown;
  action_taken: string;
}) {
  getDb()
    .prepare("INSERT INTO security_threats (source, content, detection_json, action_taken) VALUES (?, ?, ?, ?)")
    .run(threat.source, threat.content, JSON.stringify(threat.detection_json), threat.action_taken);
}

export function getSecurityThreats(limit = 50) {
  return getDb()
    .prepare("SELECT * FROM security_threats ORDER BY timestamp DESC LIMIT ?")
    .all(limit);
}
