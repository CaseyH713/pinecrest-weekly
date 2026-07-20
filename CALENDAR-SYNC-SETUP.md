# Calendar daily auto-sync — one-time setup (no IT, no service account)

Your login already has read access to all four calendars (Judah, Matt, Ben, and
the Gusto PTO calendar), so we don't need a service account or IT. Instead you
authorize the sync **once**, and the daily job reuses that authorization forever.
This is three steps, done once. After that it runs itself every morning.

## Step 1 — Create a small Google "app" (OAuth client)

This is what lets the job hold your authorization. It does NOT need a Google
admin — do it in your own account.

1. Go to https://console.cloud.google.com → create a project (any name, e.g.
   "pinecrest-calendar-sync").
2. Search "Google Calendar API" → **Enable** it.
3. Left menu → **APIs & Services → OAuth consent screen**: choose **Internal**
   (if offered — that's simplest for a company account) or **External** + add
   yourself as a test user. Fill the required name/email fields, save.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   application type **Desktop app** → Create.
5. Copy the **Client ID** and **Client secret** it shows you.

## Step 2 — Authorize once (mints the refresh token)

On your machine, from the repo folder, run (paste your two values in):

```
npm install googleapis
GOOGLE_OAUTH_CLIENT_ID=<client id> GOOGLE_OAUTH_CLIENT_SECRET=<client secret> node scripts/auth-once.mjs
```

It prints a URL. Open it, sign in as **casey.hickey@pinecrestgroup.com** (the
account that sees the calendars), approve. It prints back a
`GOOGLE_OAUTH_REFRESH_TOKEN=...` value. That token is the durable authorization.

(In a Claude Code session you can run the command with a leading `!` so the
output comes back here and I'll grab the token for you.)

## Step 3 — Store the three secrets

In the `CaseyH713/pinecrest-weekly` repo → Settings → Secrets and variables →
Actions, add three repository secrets (or paste the values to me and I'll set
them with `gh secret set`):

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

## Then (my side)

- Run the workflow once by hand (Actions tab → Daily calendar sync → Run) to
  confirm it produces `meetings-<date>.json` with the right meetings/PTO.
- Uncomment the daily `schedule:` line in `.github/workflows/sync-calendar.yml`
  to turn on the 12:00-UTC run.
- The hub already loads `meetings-<date>.json`, so once the files publish,
  everyone sees the meetings without signing in.

## Notes

- Read-only: the scope is `calendar.readonly` — the job can't change anything.
- The refresh token is a credential — it lives only in the GitHub secret, never
  in the code or repo.
- Your recorded outcomes (won/lost/no-show/notes) are stored separately in
  `outcomes-<week>.json` keyed to each meeting's stable ID, so the daily refresh
  never overwrites them.
- Gusto PTO comes through the same login, so no special handling needed.
