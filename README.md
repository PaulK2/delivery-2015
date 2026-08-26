# Автопарк — delivery-2015

Internal fleet operations platform. Mobile-first web app with a **100% Bulgarian UI**,
backed by **Google Sheets + Google Apps Script** (no traditional SQL database).

```
User → React app (GitHub Pages) → Apps Script Web App → Google Sheets
```

## Status — Phase 1 (Foundation)

Implemented:

- Project scaffold (Vite + React, HashRouter, PWA manifest)
- Central config, Bulgarian date/time + shift utilities
- Auth: employee + PIN login, server-side sessions, hashed PINs
- Home page: interactive Sofia map (Leaflet), date navigation, location detail panel
- Current schedule page: filters (employee / location / shift), day grouping,
  isolated schedule parser, admin schedule-source config
- Apps Script backend: `auth`, `schedule`, `locations`, audit log, script locking
- Google Sheets schema + setup helpers

Later phases (per the build spec): Fleet (§Phase 2), Availability (§Phase 3),
Maintenance (§Phase 4), Documents (§Phase 5), Polish/PWA/search (§Phase 6).

## Getting started

See **[docs/SETUP.md](docs/SETUP.md)** for backend + frontend setup, and
**[docs/SHEETS_SCHEMA.md](docs/SHEETS_SCHEMA.md)** for the data model.

```bash
npm install
npm run dev
```

## Structure

```
backend/            Google Apps Script (.gs) — the API + data bridge
src/
  config/           app configuration (shift times, map, thresholds)
  services/         api client, auth, schedule (+ isolated parser)
  context/          React auth context
  components/       layout, nav, map, panels, shared UI
  pages/            Home, Schedule, Login, placeholders
  utils/            Bulgarian date/time, shift helpers
  styles/           design system (global.css)
docs/               setup + sheet schema
```
