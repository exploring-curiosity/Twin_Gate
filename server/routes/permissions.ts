import { Router } from "express";
import { getAllPermissionConfigs, getPermissionConfig, upsertPermissionConfig } from "../db.js";

const router = Router();

const DEFAULT_CONFIG = (source: string) => ({
  source,
  conversations: { allow: [], deny: [] },
  people: { allow: [], deny: [] },
  content: { blocked_topics: [], blocked_patterns: [] },
  capabilities: { read: false, suggest: false, auto_reply: false },
});

router.get("/", (_req, res) => {
  const configs = getAllPermissionConfigs();
  const sources = ["discord", "gmail", "google_calendar", "slack", "linkedin", "telegram", "twitter"];
  for (const s of sources) {
    if (!configs[s]) configs[s] = DEFAULT_CONFIG(s);
  }
  res.json(configs);
});

router.get("/:source", (req, res) => {
  const config = getPermissionConfig(req.params.source) || DEFAULT_CONFIG(req.params.source);
  res.json(config);
});

router.put("/:source", (req, res) => {
  const { source } = req.params;
  const config = { ...DEFAULT_CONFIG(source), ...req.body, source };
  upsertPermissionConfig(source, config);
  res.json(config);
});

router.post("/:source/toggle", (req, res) => {
  const { source } = req.params;
  const { capability } = req.body;
  if (!["read", "suggest", "auto_reply"].includes(capability)) {
    res.status(400).json({ error: "Invalid capability" });
    return;
  }
  const existing = getPermissionConfig(source) || DEFAULT_CONFIG(source);
  existing.capabilities[capability as keyof typeof existing.capabilities] =
    !existing.capabilities[capability as keyof typeof existing.capabilities];
  upsertPermissionConfig(source, existing);
  res.json(existing);
});

export default router;
