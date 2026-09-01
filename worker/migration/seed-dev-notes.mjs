// One-time seed (idempotent upsert by note_id): backfills the private dev changelog
// (dev_notes) with a summary per work day, reconstructed from git history, plus this
// session's Worker+D1 migration work. Attributed to ПАВЕЛ per the request that added
// this feature. In English on purpose — Dev Notes is the two devs' own private space,
// unlike the rest of the (Bulgarian) app. Run:
//   node worker/migration/seed-dev-notes.mjs > worker/migration/dev-notes-seed.sql
//   npx wrangler d1 execute fleetview-db --local --file=worker/migration/dev-notes-seed.sql
//   npx wrangler d1 execute fleetview-db --remote --file=worker/migration/dev-notes-seed.sql
const AUTHOR_ID = 'EMP-5d896babef' // ПАВЕЛ
const AUTHOR_NAME = 'ПАВЕЛ'

const notes = [
  {
    created_at: '2026-08-27T18:00:00',
    app_version: '',
    content:
      'Initial build-out: React/Vite scaffold, login, Sofia map, weekly schedule grid parsing, Автомобили (fleet list, take/release, usage history), Моята наличност (availability matrix + team overview), Сигнали и поддръжка (maintenance: report/resolve), Документи (insurance, annual inspection, expiry warnings), admin panel (employees, vehicles, locations), Cloudflare config, password system (admins first, then everyone — min 6 characters), switched displayed currency to euro, performance work (caching, code-splitting, thumbnail images).',
  },
  {
    created_at: '2026-08-28T18:00:00',
    app_version: '',
    content:
      'ПАВЕЛ and В. ПЕТКОВ can now submit their own availability (worker-admin exception). Fixed a stale-frontend bug (network-first service worker for the app shell). Build version now visible (login screen + console). Schedule improvements (collapsible days, dates shown). 2-car limit per driver. Password reveal toggle on login. Added Поръчки + Заплати (orders/payroll), Отчет (value-based deliveries, several per category), fuel expense tracking and safety-equipment checks. Fixed schedule reliability (503 errors, caching, trimming empty rows/columns).',
  },
  {
    created_at: '2026-08-29T18:00:00',
    app_version: '',
    content:
      'Simplified the UI for older/less tech-savvy users. Availability is now open the whole week + a "view as worker" toggle for worker-admins. "Още" (More) now reachable from the desktop side nav too. Safe-area padding so the mobile bottom nav can\'t hide content. Build version now shown to admins only. The logged-in user is now visible on mobile too. Removed the Ukrainian flag from the map attribution (Leaflet) — this is an internal ops tool, should stay politically neutral. The map\'s "Коли" (cars) section now comes entirely from the Cars database, not schedule text. Added admin МАГИ (full rights, same as ЦЕЦО).',
  },
  {
    created_at: '2026-09-01T12:00:00',
    app_version: 'worker-d1-2026-09-01',
    content:
      'Big one: moved the entire operational backend from Google Sheets/Apps Script to a Cloudflare Worker + D1 — 42 actions rewritten 1:1 (login, employees, locations, cars incl. take/release, maintenance, documents, availability, orders, fuel, reports, payroll). The boss\'s weekly schedule stays a read-only Google Sheet — the Worker fetches it via Google\'s public CSV export (found and fixed a real bug: the gviz endpoint breaks the schedule\'s two-row header — switched to /export?format=csv, which matches getDisplayValues() exactly). Migrated 374 rows of real data (employees, cars, history, etc.), verified row by row. Passwords were reset, not migrated (no active users yet). Added a schedule archive (up to 4 old weekly links, admin CRUD + viewer). Fixed the "Архив" tab not showing (mobile tab-bar overflow). Renamed МАГИ → МАГИ (uppercase, for consistency). Added an automated test proving the boss\'s schedule is read-only, never written to.',
  },
  {
    created_at: '2026-09-01T22:00:00',
    app_version: 'ui-2026-09-01-schedule-archive',
    content:
      'Added "Присвои по днешния график" (Автомобили, admin): a one-time initial-activation action — assigns every car from today\'s schedule to the matching employee (as if formally taken), and an unrecognized plate auto-creates a new car flagged ❓ "needs review" (the flag clears the first time an admin edits it). After that, take/release stay fully manual as before — this is only to avoid entering everything by hand on day one. And — this "Dev Notes" tab itself — visible only to ПАВЕЛ and В. ПЕТКОВ, not even other admins; every note remembers the app version it was written against.',
  },
]

function esc(s) {
  return String(s).replace(/'/g, "''")
}

let sql = ''
for (const n of notes) {
  const id = 'DEVN-' + n.created_at.replace(/[^0-9]/g, '')
  sql +=
    `INSERT INTO dev_notes (note_id, author_id, author_name, content, app_version, created_at) VALUES ` +
    `('${id}', '${AUTHOR_ID}', '${esc(AUTHOR_NAME)}', '${esc(n.content)}', '${esc(n.app_version)}', '${n.created_at}') ` +
    `ON CONFLICT(note_id) DO UPDATE SET content = excluded.content, app_version = excluded.app_version;\n`
}
console.log(sql)
