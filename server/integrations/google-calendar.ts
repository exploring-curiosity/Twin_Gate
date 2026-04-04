import { google, type calendar_v3 } from "googleapis";
import { getGoogleOAuth2Client, isGoogleConnected } from "../auth/google-oauth.js";
import { audit } from "../db.js";

export async function getUpcomingEvents(days = 7, maxResults = 20) {
  const client = getGoogleOAuth2Client();
  if (!client) return [];

  const calendar = google.calendar({ version: "v3", auth: client });

  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items || []).map((event: calendar_v3.Schema$Event) => ({
    id: event.id,
    summary: event.summary || "No title",
    description: event.description || "",
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    location: event.location || "",
    attendees: (event.attendees || []).map((a: calendar_v3.Schema$EventAttendee) => ({
      email: a.email,
      displayName: a.displayName,
      responseStatus: a.responseStatus,
    })),
    status: event.status,
    htmlLink: event.htmlLink,
  }));
}

export async function checkAvailability(dateStr: string, startHour = 9, endHour = 17) {
  const client = getGoogleOAuth2Client();
  if (!client) return { available: false, reason: "Google not connected" };

  const calendar = google.calendar({ version: "v3", auth: client });

  const date = new Date(dateStr);
  const start = new Date(date);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(date);
  end.setHours(endHour, 0, 0, 0);

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: "primary" }],
    },
  });

  const busy = res.data.calendars?.['primary']?.busy || [];
  const busySlots = busy.map((b: { start?: string | null; end?: string | null }) => ({
    start: b.start,
    end: b.end,
  }));

  return {
    available: busySlots.length === 0,
    date: dateStr,
    busySlots,
    freeHours: endHour - startHour - busySlots.length,
  };
}

export function isCalendarConnected() {
  return isGoogleConnected();
}
