import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { v4 as uuid } from 'uuid';
import { broadcast } from '../websocket.js';
import type { EventPipeline } from '../cloud/event-pipeline.js';
import type { IntegrationSource } from '../../src/types/schema.js';

let client: Client | null = null;
let connected = false;
let botTag: string | undefined;
let lastEventAt: number | undefined;
let connectionError: string | undefined;

/**
 * Create a Discord bot that feeds events through the shared pipeline.
 */
export function createDiscordBot(pipeline: EventPipeline): void {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn('[discord] DISCORD_BOT_TOKEN not set, skipping bot initialization');
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.on('clientReady', () => {
    console.log(`[discord] Bot online as ${client!.user?.tag}`);
    connected = true;
    botTag = client!.user?.tag;
    connectionError = undefined;
    broadcast({ type: 'integration_status', data: getDiscordStatus() });
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    lastEventAt = Date.now();

    try {
      await pipeline.processEvent({
        source: 'discord',
        conversation_id: message.channelId,
        sender_id: message.author.id,
        sender_name: message.author.username,
        content: message.content,
        timestamp: message.createdTimestamp,
      });
    } catch (err) {
      console.error('[discord] Pipeline error:', (err as Error).message);
    }
  });

  client.on('error', (err) => {
    console.error('[discord] Client error:', err.message);
    connectionError = err.message;
    broadcast({ type: 'integration_error', data: { source: 'discord', error: err.message } });
  });

  client.on('disconnect', () => {
    connected = false;
    botTag = undefined;
    broadcast({ type: 'integration_status', data: getDiscordStatus() });
  });

  client.login(token).catch((err: Error) => {
    console.error('[discord] Login failed:', err.message);
    connectionError = err.message;
    connected = false;
  });
}

export async function stopDiscordBot(): Promise<void> {
  if (client) {
    client.destroy();
    client = null;
    connected = false;
    botTag = undefined;
    broadcast({ type: 'integration_status', data: getDiscordStatus() });
  }
}

export function getDiscordStatus() {
  return {
    source: 'discord' as IntegrationSource,
    connected,
    authenticated: Boolean(process.env.DISCORD_BOT_TOKEN),
    last_event_at: lastEventAt,
    error: connectionError,
    bot_tag: botTag,
  };
}

export async function getDiscordChannels(guildId: string): Promise<{ id: string; name: string; type: number }[]> {
  if (!client || !connected) return [];
  try {
    const guild = await client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    return channels
      .filter((c) => c !== null)
      .map((c) => ({ id: c!.id, name: c!.name, type: c!.type }));
  } catch (err) {
    console.error('[discord] Failed to fetch channels:', (err as Error).message);
    return [];
  }
}

export async function sendDiscordMessage(channelId: string, content: string): Promise<{ ok: boolean; message_id?: string; error?: string }> {
  if (!client || !connected) return { ok: false, error: 'Bot not connected' };
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) return { ok: false, error: 'Channel not found or not text-based' };
    const msg = await (channel as { send: (c: string) => Promise<{ id: string }> }).send(content);
    return { ok: true, message_id: msg.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function listRecentEmails(_count: number): Promise<never[]> {
  // Discord doesn't have emails — this is a stub to satisfy shared route exports
  return [];
}
