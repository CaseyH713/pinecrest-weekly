# Calendar daily auto-sync — IT setup (one-time)

The hub can pull the sales calendars every morning with no one signed in, but it
needs a Google credential that belongs to the company (not a person). Until the
steps below are done, the daily job (`.github/workflows/sync-calendar.yml`) stays
inactive.

## What to provision

1. **Create a Google service account** (Google Cloud console, any project owned by
   the Pinecrest Google Workspace org):
   - Enable the **Google Calendar API** on the project.
   - Create a service account (e.g. `pinecrest-calendar-sync`).
   - Create a **JSON key** for it and download it. This key is the secret.

2. **Give the service account read access to the 4 calendars.** Simplest route (no
   domain-wide delegation): in Google Calendar, for each calendar below →
   Settings → *Share with specific people* → add the service account's email
   (`...@...iam.gserviceaccount.com`) with **"See all event details."**
   - `judah@pinecrestgroup.com`
   - `matt@pinecrestgroup.com`
   - `ben@pinecrestgroup.com`
   - Gusto PTO calendar (`4dijd2554lesk1idet9iuotptpqhvk3s@import.calendar.google.com`)

   (If IT prefers domain-wide delegation instead of per-calendar sharing, that also
   works — tell me and I'll switch the script to impersonation.)

3. **Store the key as a repo secret.** In the `CaseyH713/pinecrest-weekly` repo →
   Settings → Secrets and variables → Actions → New repository secret:
   - Name: `GOOGLE_SA_KEY`
   - Value: the entire contents of the JSON key file.

## Then (my side)

- Run the workflow once by hand (Actions tab → Daily calendar sync → Run) to
  confirm it produces `meetings-<date>.json` files with the right meetings/PTO.
- Uncomment the daily `schedule:` line in the workflow to turn on the 12:00-UTC
  run.
- Refactor the hub to load those published `meetings-<date>.json` files so viewers
  see them without signing in.

## Notes

- The service account only ever **reads** calendars. It cannot edit them.
- Your recorded outcomes (won / lost / no-show / notes) are stored separately in
  `outcomes-<week>.json` and are keyed to each meeting's stable ID, so the daily
  meeting refresh never overwrites them.
- The JSON key is a real credential — it goes only in the GitHub secret, never in
  the code or anywhere in the repo.
