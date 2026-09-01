# Автопарк — delivery-2015

Internal fleet operations platform. Mobile-first web app with a **100% Bulgarian UI**,
backed by a **Cloudflare Worker + D1** (SQL database). The boss's weekly schedule stays
a **read-only Google Sheet** — the Worker fetches it directly (public CSV export, no
Google credentials needed); everything else (employees, cars, availability, orders,
fuel, payroll, …) lives in D1.

```
User → React app (Cloudflare) → Worker (/api) → D1
                                       ↓
                          boss's schedule Google Sheet (read-only CSV fetch)
```

## Status

**Backend** (`worker/`) — a Cloudflare Worker deployed alongside the frontend in the
same project — covers every phase: auth/sessions, employees, locations, schedule
(read-only), cars + take/release, usage history, maintenance, documents, availability,
orders, fuel expenses, daily reports, payroll, audit log.

Originally built against Google Sheets + Apps Script (`backend/Backend.gs`, kept in the
repo as a dormant historical reference — nothing calls it anymore); migrated to
Workers + D1 for speed, reliability, and independence from Google Sheets as an
operational datastore.

**Frontend** — every screen wired end-to-end: Home map, График (schedule), Моят ден,
Автомобили (take/release, maintenance, documents), Моята наличност, Администрация
(employees/vehicles/locations/passwords/payroll), global search, installable PWA.

## Getting started

See **[docs/SETUP.md](docs/SETUP.md)** for backend + frontend setup, and
**[docs/SHEETS_SCHEMA.md](docs/SHEETS_SCHEMA.md)** for the D1 schema and the boss's
schedule grid format.

```bash
npm install
npm run dev
```

## Structure

```
worker/             Cloudflare Worker (the backend) — /api/* routes, D1 access
  routes/           one module per domain (employees, cars, availability, payroll, …)
  lib/               auth/session/password, shared utils, schedule CSV fetch + parse
  schema.sql         D1 schema
backend/Backend.gs  dormant — the original Apps Script backend, kept for reference only
src/
  config/           app configuration (shift times, map, thresholds)
  services/         api client, auth, schedule (+ isolated parser)
  context/          React auth context
  components/       layout, nav, map, panels, admin/, global search, shared UI
  pages/            Home, Schedule, Availability, Vehicles, Maintenance, Admin, Login
  utils/            Bulgarian date/time, shift helpers
  styles/           design system (global.css)
docs/               setup + D1 schema + schedule grid format
```
