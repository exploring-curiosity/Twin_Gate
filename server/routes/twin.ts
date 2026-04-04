import { Router } from "express";
import { evaluateMessage, buildProfileFromHistory, runTwinConversation } from "../twin/digital-twin.js";
import { getAgentProfile, getPendingSuggestions, updateSuggestionStatus, upsertAgentProfile, getEvents, getAllPermissionConfigs, audit } from "../db.js";
import { scanForPII } from "../security/pii-detector.js";
import { detectDistillationAttack } from "../security/validia-detector.js";
import { listRecentEmails } from "../integrations/gmail.js";
import { getUpcomingEvents } from "../integrations/google-calendar.js";
import { sendTwinContext } from "../cloud/openclaw-client.js";

const router = Router();

router.post("/evaluate", async (req, res) => {
  const { source, conversation_id, sender_id, sender_name, content } = req.body;
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const profile = getAgentProfile("self");
  const decision = await evaluateMessage(
    { source: source || "manual", conversation_id: conversation_id || "test", sender_id: sender_id || "unknown", sender_name, content },
    profile || undefined
  );
  res.json(decision);
});

router.get("/suggestions", (_req, res) => {
  const suggestions = getPendingSuggestions();
  res.json(suggestions);
});

router.post("/suggestions/:id/approve", (req, res) => {
  updateSuggestionStatus(parseInt(req.params.id), "approved");
  res.json({ success: true });
});

router.post("/suggestions/:id/reject", (req, res) => {
  updateSuggestionStatus(parseInt(req.params.id), "rejected");
  res.json({ success: true });
});

router.get("/profile", (_req, res) => {
  const profile = getAgentProfile("self");
  res.json(profile || { user_id: "self", display_name: "", skills: [], interests: [] });
});

router.put("/profile", (req, res) => {
  upsertAgentProfile({ user_id: "self", display_name: "", skills: [], interests: [], ...req.body });
  res.json({ success: true });
});

// POST /api/twin/rebuild — derive profile from allowed events in DB
router.post("/rebuild", async (_req, res) => {
  try {
    const events = getEvents(100, 0) as Array<{
      source: string;
      sender_name: string | null;
      content: string;
      sent_to_cloud: number;
    }>;

    const sentEvents = events.filter((e) => e.sent_to_cloud === 1);
    const permConfigs = getAllPermissionConfigs();
    const existingRaw = getAgentProfile("self") as Record<string, unknown> | null;
    const existing = existingRaw as { display_name?: string; skills?: string[]; interests?: string[]; employer?: string; location?: string } | null;

    if (sentEvents.length === 0) {
      res.json({ success: false, reason: "No events have passed your filters yet. Configure integrations and wait for messages to come in." });
      return;
    }

    const derived = await buildProfileFromHistory(sentEvents, existing || undefined);

    if (derived) {
      upsertAgentProfile({
        user_id: "self",
        display_name: (existing?.display_name as string) || derived.display_name || "",
        skills: derived.skills,
        interests: derived.interests,
        communication_style: derived.communication_style,
        employer: existing?.employer as string | undefined,
        location: existing?.location as string | undefined,
      });
      res.json({ success: true, profile: derived, events_used: sentEvents.length, sources: Object.keys(permConfigs) });
    } else {
      res.json({ success: false, reason: "AI inference failed — check ANTHROPIC_API_KEY" });
    }
  } catch (err) {
    console.error("[twin/rebuild]", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/twin/distill — collect all accessible data, scrub PII, send to cloud twin
router.post("/distill", async (_req, res) => {
  const stats = {
    collected: 0,
    skipped_critical_pii: 0,
    redacted: 0,
    skipped_attack: 0,
    sent_to_cloud: 0,
    sources: [] as string[],
  };

  type DataItem = { source: string; content: string; sender?: string; timestamp?: number };
  const items: DataItem[] = [];

  // 1. DB events (already passed permission filters)
  const dbEvents = getEvents(200, 0) as Array<{ source: string; sender_name: string | null; content: string; timestamp: number; sent_to_cloud: number }>;
  for (const e of dbEvents) {
    items.push({ source: e.source, content: e.content, sender: e.sender_name || undefined, timestamp: e.timestamp });
  }
  if (dbEvents.length > 0) stats.sources.push("events_db");

  // 2. Gmail (recent emails)
  try {
    const emails = await listRecentEmails(50);
    for (const e of emails) {
      items.push({
        source: "gmail",
        content: `Subject: ${e.subject}\nFrom: ${e.from}\n${e.snippet}`,
        sender: e.from,
      });
    }
    if (emails.length > 0) stats.sources.push("gmail");
  } catch { /* not connected */ }

  // 3. Calendar
  try {
    const events = await getUpcomingEvents(30);
    for (const e of events) {
      items.push({
        source: "google_calendar",
        content: `Event: ${e.summary}\nStart: ${e.start}\nEnd: ${e.end}${e.description ? `\n${e.description}` : ""}`,
      });
    }
    if (events.length > 0) stats.sources.push("google_calendar");
  } catch { /* not connected */ }

  stats.collected = items.length;

  // 4. Filter: PII scan + attack detection → build clean dataset
  const cleanItems: DataItem[] = [];

  for (const item of items) {
    // Attack detection — skip distillation probes entirely
    const attackResult = detectDistillationAttack(item.content);
    if (attackResult.recommendation === "block") {
      stats.skipped_attack++;
      continue;
    }

    // PII scan
    const piiResult = scanForPII(item.content);

    // Skip items with critical PII (financial, identity docs)
    const hasCritical = piiResult.detections.some(d => d.severity === "critical");
    if (hasCritical) {
      stats.skipped_critical_pii++;
      continue;
    }

    // Use redacted version if any PII detected
    if (piiResult.has_pii) {
      stats.redacted++;
      cleanItems.push({ ...item, content: piiResult.redacted_content });
    } else {
      cleanItems.push(item);
    }
  }

  // 5. Send to Cloud OpenClaw for twin building
  const permConfigs = getAllPermissionConfigs() as Record<string, { content?: { blocked_topics?: string[] } }>;
  const blockedTopics = Object.values(permConfigs)
    .flatMap(c => c.content?.blocked_topics || []);

  const cloudPayload = {
    user_id: "self",
    conversation_history: cleanItems.map(item => ({
      id: undefined,
      source: item.source,
      conversation_id: item.source,
      sender_id: item.sender || item.source,
      sender_name: item.sender,
      content: item.content,
      timestamp: item.timestamp || Date.now(),
    })),
    permissions: { blocked_topics: blockedTopics },
  };

  const cloudResult = await sendTwinContext(cloudPayload);
  stats.sent_to_cloud = cloudResult ? cleanItems.length : 0;

  // 6. Also rebuild local profile from clean data
  const existing = getAgentProfile("self") as Record<string, unknown> | null;
  const derived = await buildProfileFromHistory(
    cleanItems.map(i => ({ source: i.source, sender_name: i.sender || null, content: i.content })),
    existing as { display_name?: string; skills?: string[]; interests?: string[] } | undefined
  );

  if (derived) {
    upsertAgentProfile({
      user_id: "self",
      display_name: (existing?.display_name as string) || derived.display_name || "",
      skills: derived.skills,
      interests: derived.interests,
      communication_style: derived.communication_style,
      employer: existing?.employer as string | undefined,
      location: existing?.location as string | undefined,
    });
  }

  audit("twin.distilled", "self", stats);

  res.json({
    success: true,
    stats,
    profile: derived,
    cloud_synced: Boolean(cloudResult),
    clean_items: cleanItems.length,
  });
});

// POST /api/twin/chat-between — make two account twins talk to each other
router.post("/chat-between", async (req, res) => {
  const { account_a, account_b, opening_message, turns = 6 } = req.body as {
    account_a?: string;
    account_b?: string;
    opening_message?: string;
    turns?: number;
  };
  if (!account_a || !account_b || !opening_message) {
    res.status(400).json({ error: "account_a, account_b, and opening_message are required" });
    return;
  }
  const profileA = getAgentProfile(account_a);
  const profileB = getAgentProfile(account_b);
  if (!profileA) { res.status(400).json({ error: `Account ${account_a} has no digital twin yet` }); return; }
  if (!profileB) { res.status(400).json({ error: `Account ${account_b} has no digital twin yet` }); return; }
  try {
    const conversation = await runTwinConversation(
      profileA as { display_name?: string; skills?: string[]; interests?: string[]; communication_style?: string },
      profileB as { display_name?: string; skills?: string[]; interests?: string[]; communication_style?: string },
      opening_message,
      Math.min(Math.max(turns, 1), 12)
    );
    audit("twin.chat_between", "system", { account_a, account_b, turns: conversation.length });
    res.json({ conversation, profile_a: profileA, profile_b: profileB });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
