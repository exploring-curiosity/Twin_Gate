import { Router } from "express";
import { getDiscordStatus, getDiscordChannels, sendDiscordMessage } from "../integrations/discord.js";

const router = Router();

router.get("/status", (_req, res) => {
  res.json(getDiscordStatus());
});

router.get("/guilds", (_req, res) => {
  res.json([]);
});

router.get("/channels/:guildId", async (req, res) => {
  const channels = await getDiscordChannels(req.params.guildId);
  res.json(channels);
});

router.post("/send/:channelId", async (req, res) => {
  try {
    const result = await sendDiscordMessage(req.params.channelId, req.body.content);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
