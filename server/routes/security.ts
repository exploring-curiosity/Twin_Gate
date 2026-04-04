import { Router } from "express";
import { detectDistillationAttack, getThresholds, setThresholds } from "../security/validia-detector.js";
import { getSecurityThreats } from "../db.js";

const router = Router();

router.get("/threats", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const threats = getSecurityThreats(limit);
  res.json(threats);
});

router.get("/stats", (_req, res) => {
  const threats = getSecurityThreats(1000) as Array<{ action_taken: string; detection_json: string }>;
  const stats = {
    total: threats.length,
    blocked: threats.filter((t) => t.action_taken === "block").length,
    flagged: threats.filter((t) => t.action_taken === "flag").length,
    by_category: {} as Record<string, number>,
  };
  for (const t of threats) {
    try {
      const det = JSON.parse(t.detection_json);
      if (det.category) {
        stats.by_category[det.category] = (stats.by_category[det.category] || 0) + 1;
      }
    } catch { /* skip */ }
  }
  res.json(stats);
});

router.post("/scan", (req, res) => {
  const { content } = req.body;
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const result = detectDistillationAttack(content);
  res.json(result);
});

router.get("/config", (_req, res) => {
  res.json(getThresholds());
});

router.put("/config", (req, res) => {
  const { block, flag } = req.body;
  if (typeof block === "number" && typeof flag === "number") {
    setThresholds(block, flag);
  }
  res.json(getThresholds());
});

export default router;
