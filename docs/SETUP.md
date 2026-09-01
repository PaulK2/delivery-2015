# Setup guide

Two halves: the **backend** (a Cloudflare Worker + D1, in `worker/`) and the
**frontend** (this Vite/React app), deployed together as one Cloudflare project. The
boss's weekly schedule stays a separate, read-only Google Sheet the Worker fetches
directly.

## 1. Backend — Cloudflare Worker + D1

The backend is `worker/index.js` (entry) + `worker/routes/*.js` + `worker/lib/*.js`,
backed by a D1 database (SQL) bound as `env.DB`. Schema lives in `worker/schema.sql`.

1. `npx wrangler d1 create <your-db-name>` and put the returned `database_id` into
   `wrangler.jsonc`'s `d1_databases` entry (binding name `DB`).
2. Apply the schema: `npx wrangler d1 execute <your-db-name> --local --file=worker/schema.sql`
   for local dev, and `--remote` instead of `--local` for production.
3. Set the password-hashing salt as a secret (any random string — pick a new one for a
   fresh install; only reuse a specific value if migrating existing password hashes,
   see below): `npx wrangler secret put PIN_SALT`. For local dev, put the same key in
   `.dev.vars` (see `.dev.vars.example`) instead — `wrangler secret` is production-only.
4. `npm run dev` (Vite + the Cloudflare plugin run the Worker locally too — `/api/*`
   is live at `http://localhost:5173/api`) or `npm run deploy` for production.

### Schedule source
The weekly schedule is a **separate**, read-only Google Sheet — the app never writes to
it. It must be link-viewable (Anyone with the link → Viewer), since the Worker fetches
it via Google's public CSV export (`/export?format=csv&gid=...`), no credentials
involved. Set it in-app (**График → Google Sheet за текущия график**, admin only) or
directly in D1 (`settings` table, keys `current_schedule_sheet_url` /
`schedule_tab_name`). See [SHEETS_SCHEMA.md](SHEETS_SCHEMA.md) for the grid format the
parser expects.

> Only gid-based tab selection works (a URL with `?gid=...`, which is what you get by
> navigating to a tab and copying the URL) — there's no authenticated Sheets API access
> to resolve a tab *name* to its gid for an unauthenticated fetch.

### Migrating existing data from the old Google Sheets datastore
If you're moving from the retired Apps Script backend (`backend/Backend.gs`, kept in
the repo as a dormant reference only): that file still has a temporary
`exportAllData`/`runExportAllData` pair (run `runExportAllData` directly from the Apps
Script editor — it needs no session token, and writes a JSON dump to a Drive file).
`worker/migration/build-import-sql.mjs <export.json> <output.sql>` turns that dump into
D1-ready SQL (it also fixes the one real quirk in the raw export: Sheets auto-coerces
stored date strings into Date cells, so the dump needs the same Sofia-timezone
normalization the rest of the app already applies). Apply the generated file the same
way as the schema (step 2 above). The dump includes `password_hash`/
`password_configured` per employee (so migrated passwords *could* keep working if you
reuse the old Apps Script's `PIN_SALT` value) — but if there are no active users yet,
the simpler option is to reset every password instead (`UPDATE employees SET
password_hash = '', password_configured = 0`) and let everyone go through first-login
setup fresh; that's what this project's own migration did.

## 2. Frontend — local development

```bash
npm install
npm run dev
```

Open the printed localhost URL and log in (employee + personal password — set on
first login, minimum 6 characters). The frontend talks to the Worker same-origin at
`/api` — nothing to configure.

> The backend URL can be overridden at runtime (e.g. to point a local frontend at a
> different deployed Worker): `localStorage.setItem('fv_api_url', '<url>')` in the
> browser console.

## 3. Deploy

```bash
npm run deploy   # builds, then `wrangler deploy` — ships the SPA + Worker + D1 binding together
```

This is one Cloudflare project serving both the static app and the `/api` Worker — no
separate frontend/backend deployment steps, no CORS to worry about (same-origin).

## Notes
- Secrets (`PIN_SALT`, password hashes) live only in the Worker's environment/D1 —
  never in the browser or the repo.
- Every user authenticates with a personal password (min 6 characters), created on
  first login — there is no shared/default account.
