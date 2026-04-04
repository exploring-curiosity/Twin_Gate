import { google } from "googleapis";
import { getOAuthToken, upsertOAuthToken, deleteOAuthToken, audit } from "../db.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

let oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;

// Per-account OAuth clients
const accountClients = new Map<string, InstanceType<typeof google.auth.OAuth2>>();

function makeOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/oauth/google/callback";
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleOAuth2ClientForAccount(accountId: string) {
  if (!accountClients.has(accountId)) {
    const client = makeOAuth2Client();
    if (!client) return null;
    const stored = getOAuthToken(`google_${accountId}`);
    if (stored?.access_token) {
      client.setCredentials({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token || undefined,
        token_type: stored.token_type || "Bearer",
        expiry_date: stored.expiry ? new Date(stored.expiry).getTime() : undefined,
      });
    }
    client.on("tokens", (tokens) => {
      upsertOAuthToken(`google_${accountId}`, {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token || undefined,
        token_type: tokens.token_type || "Bearer",
        expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
        scope: tokens.scope || SCOPES.join(" "),
      });
    });
    accountClients.set(accountId, client);
  }
  return accountClients.get(accountId)!;
}

export function getGoogleAuthUrlForAccount(accountId: string) {
  const client = getGoogleOAuth2ClientForAccount(accountId);
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: accountId,
  });
}

export async function handleGoogleCallbackForAccount(code: string, accountId: string) {
  // Force a fresh client to avoid token reuse issues
  accountClients.delete(accountId);
  const client = getGoogleOAuth2ClientForAccount(accountId);
  if (!client) throw new Error("Google OAuth not configured");
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  upsertOAuthToken(`google_${accountId}`, {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token || undefined,
    token_type: tokens.token_type || "Bearer",
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
    scope: tokens.scope || SCOPES.join(" "),
  });
  audit("google.connected", `google_${accountId}`, { accountId });
  return tokens;
}

export function isGoogleConnectedForAccount(accountId: string) {
  return Boolean(getOAuthToken(`google_${accountId}`)?.access_token);
}

export function disconnectGoogleForAccount(accountId: string) {
  deleteOAuthToken(`google_${accountId}`);
  accountClients.delete(accountId);
  audit("google.disconnected", `google_${accountId}`, { accountId });
}

export function getGoogleOAuth2Client() {
  if (!oauth2Client) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/auth/google/callback";

    if (!clientId || !clientSecret) {
      console.log("[Google OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
      return null;
    }

    oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // Try to load stored tokens
    const stored = getOAuthToken("google");
    if (stored?.access_token) {
      oauth2Client.setCredentials({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token || undefined,
        token_type: stored.token_type || "Bearer",
        expiry_date: stored.expiry ? new Date(stored.expiry).getTime() : undefined,
      });
    }

    // Auto-refresh tokens
    oauth2Client.on("tokens", (tokens) => {
      upsertOAuthToken("google", {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token || undefined,
        token_type: tokens.token_type || "Bearer",
        expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
        scope: tokens.scope || SCOPES.join(" "),
      });
      audit("google.tokens_refreshed", "google", {});
    });
  }
  return oauth2Client;
}

export function getGoogleAuthUrl() {
  const client = getGoogleOAuth2Client();
  if (!client) return null;

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function handleGoogleCallback(code: string) {
  const client = getGoogleOAuth2Client();
  if (!client) throw new Error("Google OAuth not configured");

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  upsertOAuthToken("google", {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token || undefined,
    token_type: tokens.token_type || "Bearer",
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
    scope: tokens.scope || SCOPES.join(" "),
  });

  audit("google.connected", "google", { scope: tokens.scope });
  return tokens;
}

export function isGoogleConnected() {
  const stored = getOAuthToken("google");
  return Boolean(stored?.access_token);
}

export function disconnectGoogle() {
  deleteOAuthToken("google");
  oauth2Client = null;
  audit("google.disconnected", "google", {});
}
