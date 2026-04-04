import { Router } from 'express';
import { getDiscordStatus, stopDiscordBot } from '../integrations/discord.js';
import { getGmailStatus } from '../integrations/gmail.js';
import { getCalendarStatus } from '../integrations/calendar.js';
import type { IntegrationStatus } from '../../src/types/schema.js';

const router = Router();

// GET /api/integrations — status of all integrations
router.get('/', (_req, res) => {
  const statuses: Record<string, IntegrationStatus> = {
    discord: getDiscordStatus(),
    gmail: getGmailStatus(),
    calendar: getCalendarStatus(),
    slack: { source: 'slack', connected: false, authenticated: false },
  };
  res.json(statuses);
});

// POST /api/integrations/discord/disconnect
router.post('/discord/disconnect', async (_req, res) => {
  await stopDiscordBot();
  res.json(getDiscordStatus());
});

export default router;
