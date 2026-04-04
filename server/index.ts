import "dotenv/config";
import express from "express";
import cors from "cors";
import { getDb } from "./db.js";
import { createOpenClawClient } from "./cloud/openclaw-client.js";
import { createEventPipeline } from "./cloud/event-pipeline.js";
import { createDiscordBot } from "./integrations/discord.js";
import { startGmailPolling } from "./integrations/gmail.js";
import { createGroupChatEngine } from "./social/group-chat.js";
import { handleGoogleCallback, handleGoogleCallbackForAccount } from "./auth/google-oauth.js";

// Route imports
import permissionsRouter from "./routes/permissions.js";
import eventsRouter from "./routes/events.js";
import auditRouter from "./routes/audit.js";
import discordRouter from "./routes/discord.js";
import authRouter from "./routes/auth.js";
import twinRouter from "./routes/twin.js";
import securityRouter from "./routes/security.js";
import { createCloudRouter } from "./routes/cloud.js";
import { createSocialRouter } from "./routes/social.js";
import accountsRouter from "./routes/accounts.js";
import messagesRouter from "./routes/messages.js";

const app = express();
const PORT = parseInt(process.env.ZEROCLAW_PORT || "3001");

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

// Initialize DB
console.log("[ZeroClaw] Initializing database...");
getDb();

// Initialize Cloud OpenClaw client
console.log("[ZeroClaw] Connecting to Cloud OpenClaw...");
const cloudClient = createOpenClawClient();

// Initialize Event Pipeline
const pipeline = createEventPipeline(cloudClient);

// Log pipeline results
pipeline.onResult((result) => {
  const status = result.filtered ? "FILTERED" : result.securityBlocked ? "SECURITY_BLOCKED" : result.sentToCloud ? "SENT" : "ERROR";
  console.log(
    `[Pipeline] ${status} | ${result.event.source} | ${result.event.conversation_id} | ${result.event.sender_name || result.event.sender_id}`
  );
});

// Initialize Group Chat Engine
const chatEngine = createGroupChatEngine();

// --- Mount Routes ---
app.use("/api/permissions", permissionsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/discord", discordRouter);
app.use("/api/auth", authRouter);

// Direct handler for Google Cloud Console redirect URI (supports per-account via state param)
app.get("/oauth/google/callback", async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string | undefined; // account id if per-account flow
  if (!code) { res.status(400).send("Missing code"); return; }
  try {
    if (state && state.length > 10) {
      // Per-account flow
      await handleGoogleCallbackForAccount(code, state);
    } else {
      // Default (legacy) flow
      await handleGoogleCallback(code);
    }
    res.send(`<html><body style="background:#1a1a2e;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div style="text-align:center"><h1 style="color:#22c55e">Connected!</h1><p>Google account linked to ZeroClaw.</p><p style="color:#6b7280">You can close this tab.</p></div></body></html>`);
  } catch (err) {
    res.status(500).send("OAuth failed: " + (err as Error).message);
  }
});
app.use("/api/twin", twinRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/security", securityRouter);
app.use("/api/cloud", createCloudRouter(cloudClient));
app.use("/api/social", createSocialRouter(chatEngine));

// --- SSE endpoint for real-time events ---
const sseClients: Set<express.Response> = new Set();

app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

pipeline.onResult((result) => {
  const data = JSON.stringify({
    type: "pipeline_event",
    source: result.event.source,
    filtered: result.filtered,
    securityBlocked: result.securityBlocked,
    sentToCloud: result.sentToCloud,
    filterReason: result.filterReason,
    timestamp: result.event.timestamp,
  });
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
});

// --- Health check ---
app.get("/api/health", async (_req, res) => {
  const cloudHealth = await cloudClient.healthCheck();
  res.json({
    status: "ok",
    server: "zeroclaw",
    port: PORT,
    cloud: cloudHealth,
    integrations: {
      discord: Boolean(process.env.DISCORD_BOT_TOKEN),
      google: Boolean(process.env.GOOGLE_CLIENT_ID),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\n===============================================`);
  console.log(`  ZeroClaw Server running on http://localhost:${PORT}`);
  console.log(`===============================================`);
  console.log(`  Cloud OpenClaw: ${process.env.OPENCLAW_CLOUD_URL || "not configured"}`);
  console.log(`  Discord Bot:    ${process.env.DISCORD_BOT_TOKEN ? "enabled" : "disabled"}`);
  console.log(`  Google OAuth:   ${process.env.GOOGLE_CLIENT_ID ? "enabled" : "disabled"}`);
  console.log(`  Anthropic API:  ${process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled"}`);
  console.log(`===============================================\n`);

  // Start Discord bot
  if (process.env.DISCORD_BOT_TOKEN) {
    createDiscordBot(pipeline);
  }

  // Start Gmail polling (if connected)
  startGmailPolling(pipeline);

  // Check cloud connection
  cloudClient.healthCheck().then((h) => {
    console.log(`[Cloud OpenClaw] ${h.ok ? "Connected" : "Unreachable"}: ${h.status}`);
  });
});

export default app;
