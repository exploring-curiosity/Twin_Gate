import { Router } from 'express';
import { google } from 'googleapis';
import { upsertOAuthToken } from '../db.js';

const router = Router();

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// GET /oauth/google — initiate OAuth flow
router.get('/google', (_req, res) => {
  const client = getOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/calendar.readonly',
  ];
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
  res.redirect(url);
});

// GET /oauth/google/callback — handle OAuth callback
router.get('/google/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Store encrypted tokens for both Gmail and Calendar
    upsertOAuthToken('google', {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token || undefined,
      token_type: tokens.token_type || 'Bearer',
      expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : undefined,
    });

    console.log('[oauth] Google tokens stored successfully');
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?oauth=success`);
  } catch (err) {
    console.error('[oauth] Token exchange failed:', err);
    res.status(500).send('OAuth failed: ' + (err as Error).message);
  }
});

export { getOAuth2Client };
export default router;
