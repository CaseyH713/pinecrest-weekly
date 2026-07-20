// Daily calendar sync — server-side twin of the hub's in-browser gcalFetchWeek.
// Reads the 3 MD calendars + Gusto PTO calendar using a one-time OAuth
// authorization from a user account that already has read access to them
// (Casey's login sees all four), and writes per-week meetings JSON
// (meetings-<mondayISO>.json) the hub loads.
//
// Auth: OAuth2 refresh token (see scripts/auth-once.mjs to mint it, and
// CALENDAR-SYNC-SETUP.md for the one-time setup). No service account, no IT.
//
// Meetings are derived fresh from the calendar each run; OUTCOMES (won/lost/
// no-show/notes) live separately in outcomes-<wk>.json keyed by the stable
// GCal-derived meeting id, so re-publishing meetings never touches them.
import fs from 'fs';
import { google } from 'googleapis';

const MD_CALENDARS = {
  judah: 'judah@pinecrestgroup.com',
  matt:  'matt@pinecrestgroup.com',
  ben:   'ben@pinecrestgroup.com',
};
const GUSTO_CALENDAR_ID = '4dijd2554lesk1idet9iuotptpqhvk3s@import.calendar.google.com';

const SALES_TEAM = [
  'Judah Azose','Matt Levy','Ben Tabaria','Chaya Adelman','Diana Hakakian',
  'Sarah Ringelheim','David Shafron','Jack Shminov','Orly Tabaria','Greg Yavner',
  'Sam Gallor','Abraham Benguigui','Hannah Bernays','James Johnson','Mallory Maxwell',
  'Ari Lowenstein',
];
const MEETING_RE = /\bspp\b|supplemental\s+prevention|payroll[\s\-]?tax|section\s*125|workers?[\s\-]?comp(ensation)?|\bwc\b|group\s+health|tax\s+savings/i;
const WEEKS_TO_SYNC = 3; // current week + 2 back, matching the hub's rolling window

function isoMonday(d) {
  const dt = new Date(d); const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1) - day);
  return dt.toISOString().slice(0, 10);
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtTime = (dt) => { const h = dt.getHours(), m = dt.getMinutes(); return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM'); };

function evtToMtg(ev, repKey) {
  if (!ev.start?.dateTime || ev.status === 'cancelled') return null;
  if (!MEETING_RE.test(ev.summary || '')) return null;
  const s = new Date(ev.start.dateTime), e = new Date(ev.end.dateTime);
  const durMin = Math.round((e - s) / 60000);
  const dur = durMin >= 60 ? (durMin % 60 === 0 ? durMin / 60 + ' hr' : (durMin / 60).toFixed(1) + ' hr') : durMin + ' min';
  let meet = '';
  const ve = ev.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video');
  if (ve) meet = ve.uri;
  if (!meet && ev.location && /^https?:|zoom\.|meet\.google/i.test(ev.location)) meet = ev.location;
  let contact = '';
  const ext = ev.attendees?.find(a => !a.self && !a.organizer && !/(pinecrestgroup|pinecrestconsulting|innovativebps)\.com/.test(a.email || ''));
  if (ext) contact = ext.email;
  return {
    id: 'gc-' + repKey[0] + '-' + ev.id.replace(/[^a-z0-9]/gi, '').slice(-12),
    ts: fmtTime(s), te: fmtTime(e), dur, title: ev.summary || '(No title)',
    contact, org: '', meet, _dayKey: s.toISOString().slice(0, 10),
  };
}

function matchPerson(title) {
  const t = (title || '').toLowerCase();
  for (const name of SALES_TEAM) {
    const parts = name.toLowerCase().split(' ');
    if (t.includes(name.toLowerCase())) return name;
    if (parts.length >= 2 && t.includes(parts[0]) && t.includes(parts[parts.length - 1])) return name;
  }
  return null;
}

async function main() {
  const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_OAUTH_REFRESH_TOKEN) {
    console.error('Missing GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REFRESH_TOKEN — see CALENDAR-SYNC-SETUP.md.');
    process.exit(1);
  }
  const oauth2 = new google.auth.OAuth2(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN });
  const cal = google.calendar({ version: 'v3', auth: oauth2 });

  const listEvents = async (calendarId, timeMin, timeMax) => {
    const out = [];
    let pageToken;
    do {
      const r = await cal.events.list({ calendarId, timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 250, pageToken });
      (r.data.items || []).forEach(e => out.push(e));
      pageToken = r.data.nextPageToken;
    } while (pageToken);
    return out;
  };

  const curMonday = isoMonday(new Date());
  for (let i = 0; i < WEEKS_TO_SYNC; i++) {
    const monday = addDays(curMonday, -7 * i);
    const days = Array.from({ length: 5 }, (_, k) => addDays(monday, k));
    const timeMin = monday + 'T00:00:00Z';
    const timeMax = addDays(monday, 4) + 'T23:59:59Z';

    const meetings = {};
    for (const [repKey, calId] of Object.entries(MD_CALENDARS)) {
      meetings[repKey] = {}; days.forEach(d => { meetings[repKey][d] = []; });
      const evts = (await listEvents(calId, timeMin, timeMax)).map(e => evtToMtg(e, repKey)).filter(Boolean);
      evts.forEach(m => { if (meetings[repKey][m._dayKey]) meetings[repKey][m._dayKey].push(m); });
    }

    const pto = {};
    for (const ev of await listEvents(GUSTO_CALENDAR_ID, timeMin, timeMax)) {
      if (ev.status === 'cancelled' || !ev.start?.date) continue;
      const person = matchPerson(ev.summary);
      if (!person) continue;
      const start = new Date(ev.start.date + 'T12:00:00Z'), end = new Date(ev.end.date + 'T12:00:00Z');
      for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
        const dk = d.toISOString().slice(0, 10);
        if (days.includes(dk)) { (pto[person] ||= {})[dk] = 8; }
      }
    }

    const file = `meetings-${monday}.json`;
    const payload = { week: monday, updatedAt: new Date().toISOString(), meetings, pto };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
    const n = Object.values(meetings).reduce((s, byDay) => s + Object.values(byDay).reduce((a, arr) => a + arr.length, 0), 0);
    console.log(`${file}: ${n} meetings, ${Object.keys(pto).length} on PTO`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
