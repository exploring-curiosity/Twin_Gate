import { google, gmail_v1 } from 'googleapis';
import { v4 as uuid } from 'uuid';
import { getOAuthToken } from '../db.js';
import { getGoogleOAuth2Client } from '../auth/google-oauth.js';
import { broadcast } from '../websocket.js';
import type { EventPipeline } from '../cloud/event-pipeline.js';
import type { IntegrationSource } from '../../src/types/schema.js';

let watchInterval: ReturnType<typeof setInterval> | null = null;
let lastHistoryId: string | null = null;
let isConnected = false;
let lastEventAt: number | undefined;

/**
 * Start Gmail polling that feeds events into the shared pipeline.
 */
export function startGmailPolling(pipeline: EventPipeline): void {
  const tokens = getOAuthToken('google');
  if (!tokens?.access_token) {
    console.log('[gmail] No Google OAuth token — skipping Gmail polling');
    return;
  }

  initGmailWatch(pipeline).catch((err) => {
    console.error('[gmail] Watch init failed:', (err as Error).message);
  });
}

async function initGmailWatch(pipeline: EventPipeline): Promise<void> {
  const auth = getGoogleOAuth2Client();
  if (!auth) return;

  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const profile = await gmail.users.getProfile({ userId: 'me' });
    lastHistoryId = profile.data.historyId || null;
    isConnected = true;
    console.log('[gmail] Connected, historyId:', lastHistoryId);
    broadcast({ type: 'integration_status', data: getGmailStatus() });
  } catch (err) {
    isConnected = false;
    console.error('[gmail] Connection failed:', (err as Error).message);
    return;
  }

  if (watchInterval) clearInterval(watchInterval);
  watchInterval = setInterval(() => pollGmail(gmail, pipeline), 30_000);
  await pollGmail(gmail, pipeline);
}

async function pollGmail(gmail: gmail_v1.Gmail, pipeline: EventPipeline): Promise<void> {
  if (!lastHistoryId) return;

  try {
    const history = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: lastHistoryId,
      historyTypes: ['messageAdded'],
    });

    if (!history.data.history) return;

    for (const record of history.data.history) {
      if (!record.messagesAdded) continue;
      for (const added of record.messagesAdded) {
        const msgId = added.message?.id;
        if (!msgId) continue;

        try {
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id: msgId,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject'],
          });

          const headers = msg.data.payload?.headers || [];
          const from = headers.find((h) => h.name === 'From')?.value || 'unknown';
          const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
          const snippet = msg.data.snippet || '';

          lastEventAt = Date.now();

          await pipeline.processEvent({
            source: 'gmail',
            conversation_id: msg.data.threadId || msgId,
            sender_id: from,
            sender_name: from.split('<')[0].trim(),
            content: `Subject: ${subject}\n${snippet}`,
            timestamp: Number(msg.data.internalDate) || Date.now(),
          });
        } catch (err) {
          console.error('[gmail] Failed to fetch message:', (err as Error).message);
        }
      }
    }

    lastHistoryId = history.data.historyId || lastHistoryId;
  } catch (err) {
    const error = err as { code?: number; message: string };
    if (error.code === 404) {
      try {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        lastHistoryId = profile.data.historyId || null;
      } catch {
        console.error('[gmail] Failed to refresh history ID');
      }
    } else {
      console.error('[gmail] Poll error:', error.message);
    }
  }
}

export function getGmailStatus() {
  return {
    source: 'gmail' as IntegrationSource,
    connected: isConnected,
    authenticated: Boolean(getOAuthToken('google')?.access_token),
    last_event_at: lastEventAt,
  };
}

export function stopGmailPolling(): void {
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
    isConnected = false;
  }
}

export async function listRecentEmails(count = 10): Promise<{
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}[]> {
  const auth = getGoogleOAuth2Client();
  if (!auth) return [];

  const gmail = google.gmail({ version: 'v1', auth });

  try {
    const list = await gmail.users.messages.list({ userId: 'me', maxResults: count });
    const messages = list.data.messages || [];

    const results = await Promise.all(
      messages.map(async (m) => {
        if (!m.id) return null;
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: m.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        const headers = msg.data.payload?.headers || [];
        return {
          id: m.id,
          from: headers.find((h) => h.name === 'From')?.value || '',
          subject: headers.find((h) => h.name === 'Subject')?.value || '',
          snippet: msg.data.snippet || '',
          date: headers.find((h) => h.name === 'Date')?.value || '',
        };
      })
    );

    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  } catch (err) {
    console.error('[gmail] listRecentEmails failed:', (err as Error).message);
    return [];
  }
}

// Re-export uuid to keep existing callers happy
export { uuid };
