import { Router } from "express";
import {
  getGoogleAuthUrl,
  handleGoogleCallback,
  isGoogleConnected,
  disconnectGoogle,
} from "../auth/google-oauth.js";
import { listRecentEmails } from "../integrations/gmail.js";
import { getUpcomingEvents, checkAvailability } from "../integrations/google-calendar.js";

const router = Router();

// --- Google OAuth2 ---

router.get("/google", (_req, res) => {
  const url = getGoogleAuthUrl();
  if (!url) {
    res.status(500).json({ error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
    return;
  }
  res.redirect(url);
});

router.get("/google/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }
  try {
    await handleGoogleCallback(code);
    res.send(`
      <html><body style="background:#1a1a2e;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh">
        <div style="text-align:center">
          <h1>Connected!</h1>
          <p>Gmail + Calendar connected to ZeroClaw.</p>
          <p>You can close this window.</p>
        </div>
      </body></html>
    `);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/status", (_req, res) => {
  res.json({
    google: {
      connected: isGoogleConnected(),
      services: ["gmail", "google_calendar"],
    },
  });
});

router.post("/google/revoke", (_req, res) => {
  disconnectGoogle();
  res.json({ success: true });
});

// --- Gmail endpoints ---

router.get("/gmail/recent", async (req, res) => {
  try {
    const count = parseInt(req.query.count as string) || 10;
    const emails = await listRecentEmails(count);
    res.json(emails);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Calendar endpoints ---

router.get("/calendar/upcoming", async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const events = await getUpcomingEvents(days);
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/calendar/availability", async (req, res) => {
  try {
    const date = req.query.date as string;
    if (!date) {
      res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });
      return;
    }
    const result = await checkAvailability(date);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
