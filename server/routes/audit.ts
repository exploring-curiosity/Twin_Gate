import { Router } from "express";
import { getDb } from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const rows = getDb()
    .prepare("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ? OFFSET ?")
    .all(limit, offset);
  res.json(rows);
});

export default router;
