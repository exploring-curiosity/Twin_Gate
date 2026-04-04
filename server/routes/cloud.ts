import { Router } from "express";
import type { OpenClawClient } from "../cloud/openclaw-client.js";
import { getCloudConfig, setCloudConfig } from "../db.js";

export function createCloudRouter(cloudClient: OpenClawClient) {
  const router = Router();

  router.get("/config", (_req, res) => {
    const config = getCloudConfig();
    res.json({ url: config.url, has_api_key: Boolean(config.api_key) });
  });

  router.put("/config", async (req, res) => {
    try {
      const { url, api_key } = req.body as { url?: string; api_key?: string };
      if (!url) { res.status(400).json({ error: "url is required" }); return; }
      setCloudConfig(url.trim(), api_key?.trim() || '');
      const health = await cloudClient.healthCheck();
      res.json({ saved: true, health });
    } catch (err) {
      console.error("[cloud/config PUT]", err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get("/status", async (_req, res) => {
    const health = await cloudClient.healthCheck();
    res.json(health);
  });

  router.post("/chat", async (req, res) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array required" });
      return;
    }
    const result = await cloudClient.chat(messages);
    res.json(result);
  });

  router.post("/event", async (req, res) => {
    const { source, conversation_id, sender_id, content, timestamp } = req.body;
    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    const result = await cloudClient.sendEvent({
      source: source || "manual",
      conversation_id: conversation_id || "test",
      sender_id: sender_id || "unknown",
      content,
      timestamp: timestamp || Date.now(),
    });
    res.json(result);
  });

  return router;
}
