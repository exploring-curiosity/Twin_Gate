import { Router } from "express";
import type { GroupChatEngine } from "../social/group-chat.js";
import { upsertAgentProfile, getAgentProfile, getAllAgentProfiles } from "../db.js";

export function createSocialRouter(chatEngine: GroupChatEngine) {
  const router = Router();

  router.post("/rooms", (req, res) => {
    const { name, description, created_by } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const room = chatEngine.createRoom(name, description || "", created_by || "system");
    res.json(room);
  });

  router.get("/rooms", (_req, res) => {
    res.json(chatEngine.listRooms());
  });

  router.get("/rooms/:id/messages", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const messages = chatEngine.getMessages(req.params.id, limit);
    res.json(messages);
  });

  router.post("/message", async (req, res) => {
    const { room_id, sender_id, sender_name, content } = req.body;
    if (!room_id || !content) {
      res.status(400).json({ error: "room_id and content are required" });
      return;
    }
    const result = await chatEngine.postMessage(
      room_id,
      sender_id || "anonymous",
      sender_name || "Anonymous",
      content
    );
    res.json(result);
  });

  // --- Agent Profiles ---

  router.get("/agents", (_req, res) => {
    res.json(getAllAgentProfiles());
  });

  router.get("/agents/:userId", (req, res) => {
    const profile = getAgentProfile(req.params.userId);
    if (!profile) {
      res.status(404).json({ error: "Agent profile not found" });
      return;
    }
    res.json(profile);
  });

  router.put("/agents/:userId", (req, res) => {
    const { display_name, skills, interests, employer, location, communication_style } = req.body;
    upsertAgentProfile({
      user_id: req.params.userId,
      display_name: display_name || req.params.userId,
      skills: skills || [],
      interests: interests || [],
      employer,
      location,
      communication_style,
    });
    res.json(getAgentProfile(req.params.userId));
  });

  return router;
}
