import { google, type calendar_v3 } from 'googleapis';
import { getOAuthToken } from '../db.js';
import type { IntegrationSource } from '../../src/types/schema.js';

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const tokens = getOAuthToken('google');
  if (tokens) {
    client.setCredentials(tokens as Record<string, unknown>);
  }
  return client;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  status: string;
}

/**
 * Check if user is free during a given time range.
 */
export async function checkAvailability(
  startTime: Date,
  endTime: Date
): Promise<{ free: boolean; conflicts: CalendarEvent[] }> {
  const tokens = getOAuthToken('google');
  if (!tokens) {
    return { free: true, conflicts: [] }; // No calendar = assume free
  }

  const auth = getOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = (response.data.items || [])
      .filter((e: calendar_v3.Schema$Event) => e.status !== 'cancelled')
      .map((e: calendar_v3.Schema$Event) => ({
        id: e.id || '',
        summary: e.summary || '(busy)',
        start: e.start?.dateTime || e.start?.date || '',
        end: e.end?.dateTime || e.end?.date || '',
        status: e.status || 'confirmed',
      }));

    return {
      free: events.length === 0,
      conflicts: events,
    };
  } catch (err) {
    console.error('[calendar] Availability check failed:', (err as Error).message);
    return { free: true, conflicts: [] };
  }
}

/**
 * Get upcoming events for the next N days.
 */
export async function getUpcomingEvents(days: number = 7): Promise<CalendarEvent[]> {
  const tokens = getOAuthToken('google');
  if (!tokens) return [];

  const auth = getOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    return (response.data.items || []).map((e: calendar_v3.Schema$Event) => ({
      id: e.id || '',
      summary: e.summary || '(no title)',
      start: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
      status: e.status || 'confirmed',
    }));
  } catch (err) {
    console.error('[calendar] Failed to fetch events:', (err as Error).message);
    return [];
  }
}

/**
 * Parse natural language time references to approximate date ranges.
 */
export function parseTimeReference(text: string): { start: Date; end: Date } | null {
  const now = new Date();
  const lower = text.toLowerCase();

  // "this weekend"
  if (lower.includes('this weekend') || lower.includes('weekend')) {
    const dayOfWeek = now.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    const saturday = new Date(now);
    saturday.setDate(now.getDate() + daysUntilSaturday);
    saturday.setHours(8, 0, 0, 0);
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    sunday.setHours(23, 59, 59, 999);
    return { start: saturday, end: sunday };
  }

  // "tomorrow"
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(23, 59, 59, 999);
    return { start: tomorrow, end };
  }

  // "today"
  if (lower.includes('today')) {
    const start = new Date(now);
    start.setHours(now.getHours(), 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  // Day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const dayOfWeek = now.getDay();
      const daysUntil = (i - dayOfWeek + 7) % 7 || 7;
      const target = new Date(now);
      target.setDate(now.getDate() + daysUntil);
      target.setHours(8, 0, 0, 0);
      const end = new Date(target);
      end.setHours(23, 59, 59, 999);
      return { start: target, end };
    }
  }

  return null;
}

export function getCalendarStatus() {
  return {
    source: 'calendar' as IntegrationSource,
    connected: Boolean(getOAuthToken('google')),
    authenticated: Boolean(getOAuthToken('google')),
  };
}
