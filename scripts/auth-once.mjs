// One-time authorization helper. Run this ONCE on your own machine to mint the
// refresh token the daily calendar sync reuses forever after. Nothing is stored
// to disk — it just prints the token for you to paste into a GitHub secret.
//
// Prereq: a Google OAuth client (Desktop app type) — see CALENDAR-SYNC-SETUP.md.
// Then run, from the repo root:
//   npm install googleapis
//   GOOGLE_OAUTH_CLIENT_ID=xxx GOOGLE_OAUTH_CLIENT_SECRET=yyy node scripts/auth-once.mjs
// A URL prints; open it, sign in as the account that can see the calendars,
// approve, and the refresh token is printed back here.
import http from 'http';
import { google } from 'googleapis';

const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET } = process.env;
if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first (see CALENDAR-SYNC-SETUP.md).');
  process.exit(1);
}

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const oauth2 = new google.auth.OAuth2(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, REDIRECT);

const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // force a refresh_token even on re-auth
  scope: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get('code');
  if (!code) { res.end('No code received — you can close this tab.'); return; }
  try {
    const { tokens } = await oauth2.getToken(code);
    res.end('Authorized. You can close this tab and return to the terminal.');
    console.log('\n=== SUCCESS ===');
    if (tokens.refresh_token) {
      console.log('\nGOOGLE_OAUTH_REFRESH_TOKEN=' + tokens.refresh_token);
      console.log('\nStore that value as the GitHub secret GOOGLE_OAUTH_REFRESH_TOKEN.');
    } else {
      console.log('\nNo refresh_token returned. Revoke the app at https://myaccount.google.com/permissions and run again (prompt=consent forces it).');
    }
  } catch (e) {
    res.end('Token exchange failed — see terminal.');
    console.error(e.message);
  } finally {
    setTimeout(() => server.close(), 500);
  }
});

server.listen(PORT, () => {
  console.log('\nOpen this URL in your browser, sign in, and approve:\n');
  console.log(url + '\n');
  console.log('(Waiting for you to approve…)');
});
