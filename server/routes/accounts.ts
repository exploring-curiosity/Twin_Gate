import { Router } from "express";
import { v4 as uuid } from "uuid";
import { google } from "googleapis";
import {
  createAccount, getAccounts, getAccount, updateAccount, deleteAccount,
  setAccountOpenClaw, getAgentProfile, upsertAgentProfile, audit, getDb,
} from "../db.js";
import {
  getGoogleAuthUrlForAccount,
  isGoogleConnectedForAccount,
  disconnectGoogleForAccount,
  getGoogleOAuth2ClientForAccount,
} from "../auth/google-oauth.js";
import { buildProfileFromHistory } from "../twin/digital-twin.js";
import { scanForPII } from "../security/pii-detector.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json(getAccounts());
});

router.post("/", (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name required" }); return; }
  const id = uuid();
  createAccount(id, name.trim());
  res.json(getAccount(id));
});

router.delete("/:id", (req, res) => {
  deleteAccount(req.params.id);
  res.json({ success: true });
});

router.get("/:id/status", (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const googleConnected = isGoogleConnectedForAccount(req.params.id);
  const profile = getAgentProfile(req.params.id) as { display_name?: string; skills?: string[]; updated_at?: string } | null;
  res.json({
    ...account,
    openclaw_api_key: undefined,           // never send key to client
    has_openclaw_key: Boolean(account.openclaw_api_key),
    google_connected: googleConnected,
    has_twin: Boolean(profile),
    twin_name: profile?.display_name || account.name,
    twin_skills: profile?.skills || [],
    twin_updated_at: profile?.updated_at || null,
  });
});

// Save OpenClaw URL + optional API key for this account
router.put("/:id/openclaw", (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const { url, api_key } = req.body as { url?: string; api_key?: string };
  if (!url) { res.status(400).json({ error: "url required" }); return; }
  setAccountOpenClaw(req.params.id, url.trim(), api_key?.trim() || '');
  audit("account.openclaw_configured", req.params.id, { url: url.trim() });
  res.json({ success: true });
});

// Redirect to Google OAuth for this account
router.get("/:id/connect/google", (req, res) => {
  const url = getGoogleAuthUrlForAccount(req.params.id);
  if (!url) { res.status(500).json({ error: "Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" }); return; }
  res.redirect(url);
});

router.post("/:id/disconnect/google", (req, res) => {
  disconnectGoogleForAccount(req.params.id);
  res.json({ success: true });
});

// Build digital twin — fetch Gmail + Calendar, distill, sync to this account's OpenClaw
router.post("/:id/twin/rebuild", async (req, res) => {
  const accountId = req.params.id;
  const account = getAccount(accountId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  if (!isGoogleConnectedForAccount(accountId)) {
    res.status(400).json({ error: "Connect Google for this account first" });
    return;
  }

  const auth = getGoogleOAuth2ClientForAccount(accountId);
  if (!auth) { res.status(500).json({ error: "Failed to get OAuth client" }); return; }

  const items: Array<{ source: string; sender_name: string | null; content: string }> = [];
  let gmailCount = 0;
  let calCount = 0;

  // Fetch Gmail (sent + inbox)
  try {
    const gmail = google.gmail({ version: "v1", auth });
    const listRes = await gmail.users.messages.list({ userId: "me", maxResults: 50, q: "in:sent OR in:inbox" });
    for (const msg of (listRes.data.messages || []).slice(0, 40)) {
      try {
        const full = await gmail.users.messages.get({
          userId: "me", id: msg.id!, format: "metadata",
          metadataHeaders: ["Subject", "From"],
        });
        const headers = full.data.payload?.headers || [];
        const subject = headers.find(h => h.name === "Subject")?.value || "";
        const from = headers.find(h => h.name === "From")?.value || "";
        const snippet = full.data.snippet || "";
        const raw = `Subject: ${subject}\nFrom: ${from}\n${snippet}`;
        const pii = scanForPII(raw);
        if (!pii.detections.some(d => d.severity === "critical")) {
          items.push({ source: "gmail", sender_name: from, content: pii.has_pii ? pii.redacted_content : raw });
          gmailCount++;
        }
      } catch { /* skip */ }
    }
  } catch (err) {
    console.error(`[accounts/${accountId}] Gmail:`, (err as Error).message);
  }

  // Fetch Calendar
  try {
    const calendar = google.calendar({ version: "v3", auth });
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 60);
    const calRes = await calendar.events.list({
      calendarId: "primary", timeMin: now.toISOString(), timeMax: future.toISOString(),
      maxResults: 20, singleEvents: true, orderBy: "startTime",
    });
    for (const e of calRes.data.items || []) {
      items.push({
        source: "google_calendar", sender_name: null,
        content: `Event: ${e.summary || "Untitled"}\nStart: ${e.start?.dateTime || e.start?.date}${e.description ? `\n${e.description.slice(0, 100)}` : ""}`,
      });
      calCount++;
    }
  } catch (err) {
    console.error(`[accounts/${accountId}] Calendar:`, (err as Error).message);
  }

  if (items.length === 0) {
    res.json({ success: false, reason: "No data found. Make sure Google is connected and has email/calendar data." });
    return;
  }

  // Build local profile via Claude
  try {
    const existing = getAgentProfile(accountId) as { display_name?: string; skills?: string[]; interests?: string[] } | null;
    const derived = await buildProfileFromHistory(items, existing || undefined);

    if (!derived) {
      res.json({ success: false, reason: "Profile inference failed — check ANTHROPIC_API_KEY" });
      return;
    }

    upsertAgentProfile({
      user_id: accountId,
      display_name: derived.display_name || account.name,
      skills: derived.skills,
      interests: derived.interests,
      communication_style: derived.communication_style,
    });

    // Also push to this account's OpenClaw if configured
    let cloudSynced = false;
    if (account.openclaw_url) {
      try {
        const cloudRes = await fetch(`${account.openclaw_url}/api/twin/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(account.openclaw_api_key ? { Authorization: `Bearer ${account.openclaw_api_key}` } : {}),
          },
          body: JSON.stringify({
            user_id: accountId,
            conversation_history: items.map(i => ({
              source: i.source, conversation_id: i.source,
              sender_id: i.sender_name || i.source, sender_name: i.sender_name,
              content: i.content, timestamp: Date.now(),
            })),
            permissions: { blocked_topics: [] },
          }),
          signal: AbortSignal.timeout(30_000),
        });
        cloudSynced = cloudRes.ok;
      } catch (err) {
        console.error(`[accounts/${accountId}] OpenClaw sync:`, (err as Error).message);
      }
    }

    audit("account.twin_built", accountId, { gmail: gmailCount, calendar: calCount, cloud_synced: cloudSynced });
    res.json({ success: true, profile: derived, gmail: gmailCount, calendar: calCount, cloud_synced: cloudSynced });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
