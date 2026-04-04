import { Router } from "express";
import { v4 as uuid } from "uuid";
import { google } from "googleapis";
import {
  createAccount, getAccounts, getAccount, updateAccount, deleteAccount,
  getAgentProfile, upsertAgentProfile, audit,
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
  const accounts = getAccounts();
  res.json(accounts);
});

router.post("/", (req, res) => {
  const { name, email } = req.body as { name?: string; email?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name required" }); return; }
  const id = uuid();
  createAccount(id, name.trim(), email?.trim());
  res.json({ id, name: name.trim(), email: email?.trim() });
});

router.patch("/:id", (req, res) => {
  const { name, email } = req.body as { name?: string; email?: string };
  if (!name?.trim()) { res.status(400).json({ error: "name required" }); return; }
  updateAccount(req.params.id, name.trim(), email?.trim());
  res.json({ success: true });
});

router.delete("/:id", (req, res) => {
  deleteAccount(req.params.id);
  res.json({ success: true });
});

router.get("/:id/status", (req, res) => {
  const account = getAccount(req.params.id);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const googleConnected = isGoogleConnectedForAccount(req.params.id);
  const profile = getAgentProfile(req.params.id);
  res.json({
    ...account,
    google_connected: googleConnected,
    has_twin: Boolean(profile),
    twin_skills: (profile as { skills?: string[] } | null)?.skills || [],
    twin_name: (profile as { display_name?: string } | null)?.display_name || account.name,
  });
});

// Redirect user to Google OAuth for this account
router.get("/:id/connect/google", (req, res) => {
  const url = getGoogleAuthUrlForAccount(req.params.id);
  if (!url) {
    res.status(500).json({ error: "Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" });
    return;
  }
  res.redirect(url);
});

router.post("/:id/disconnect/google", (req, res) => {
  disconnectGoogleForAccount(req.params.id);
  res.json({ success: true });
});

// Build digital twin for this account from Gmail + Calendar
router.post("/:id/twin/rebuild", async (req, res) => {
  const accountId = req.params.id;
  const account = getAccount(accountId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }

  const auth = getGoogleOAuth2ClientForAccount(accountId);
  if (!auth || !isGoogleConnectedForAccount(accountId)) {
    res.status(400).json({ error: "Connect Google for this account first" });
    return;
  }

  const items: Array<{ source: string; sender_name: string | null; content: string }> = [];

  // Fetch Gmail
  try {
    const gmail = google.gmail({ version: "v1", auth });
    const listRes = await gmail.users.messages.list({ userId: "me", maxResults: 50, q: "in:sent OR in:inbox" });
    for (const msg of (listRes.data.messages || []).slice(0, 40)) {
      try {
        const full = await gmail.users.messages.get({
          userId: "me", id: msg.id!, format: "metadata",
          metadataHeaders: ["Subject", "From", "To"],
        });
        const headers = full.data.payload?.headers || [];
        const subject = headers.find(h => h.name === "Subject")?.value || "";
        const from = headers.find(h => h.name === "From")?.value || "";
        const snippet = full.data.snippet || "";
        const raw = `Subject: ${subject}\nFrom: ${from}\n${snippet}`;
        const pii = scanForPII(raw);
        if (!pii.detections.some(d => d.severity === "critical")) {
          items.push({ source: "gmail", sender_name: from, content: pii.has_pii ? pii.redacted_content : raw });
        }
      } catch { /* skip individual message errors */ }
    }
  } catch (err) {
    console.error(`[accounts/${accountId}] Gmail error:`, (err as Error).message);
  }

  // Fetch Calendar
  try {
    const calendar = google.calendar({ version: "v3", auth });
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 60);
    const calRes = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: "startTime",
    });
    for (const e of calRes.data.items || []) {
      items.push({
        source: "google_calendar",
        sender_name: null,
        content: `Event: ${e.summary || "Untitled"}\nStart: ${e.start?.dateTime || e.start?.date}${e.description ? `\n${e.description.slice(0, 100)}` : ""}`,
      });
    }
  } catch (err) {
    console.error(`[accounts/${accountId}] Calendar error:`, (err as Error).message);
  }

  if (items.length === 0) {
    res.json({ success: false, reason: "No data found. Make sure Google is connected and has email/calendar data." });
    return;
  }

  try {
    const existing = getAgentProfile(accountId) as { display_name?: string; skills?: string[]; interests?: string[] } | null;
    const derived = await buildProfileFromHistory(items, existing || undefined);

    if (derived) {
      upsertAgentProfile({
        user_id: accountId,
        display_name: existing?.display_name || derived.display_name || account.name,
        skills: derived.skills,
        interests: derived.interests,
        communication_style: derived.communication_style,
      });
      audit("account.twin_built", accountId, { items_used: items.length });
      res.json({ success: true, profile: derived, items_used: items.length });
    } else {
      res.json({ success: false, reason: "AI inference failed — check ANTHROPIC_API_KEY" });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
