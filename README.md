# Автопарк — delivery-2015

Internal fleet operations platform. Mobile-first web app with a **100% Bulgarian UI**,
backed by **Google Sheets + Google Apps Script** (no traditional SQL database).

```
User → React app (GitHub Pages) → Apps Script Web App → Google Sheets
```

## Status

**Backend** (`backend/Backend.gs`) — the real deployed Apps Script — already covers
every phase: auth/sessions, employees, locations, schedule (read-only), cars +
take/release, usage history, maintenance, documents, availability, audit log,
script locking.

**Frontend** — Phase 1 wired end-to-end against the live backend:

- Scaffold (Vite + React, HashRouter, PWA manifest), central config, BG date/shift utils
- Auth: employee + PIN login, server-side sessions
- Home: interactive Sofia map (Leaflet), date navigation, location detail panel
- Schedule: real weekly-**grid** parser (isolated in `services/schedule/parser.js`),
  weekday matching, filters, admin schedule-source config

Frontend still to build against the existing backend: Vehicles/fleet (Phase 2),
Availability (Phase 3), Maintenance (Phase 4), Documents (Phase 5), polish (Phase 6).

## Getting started

See **[docs/SETUP.md](docs/SETUP.md)** for backend + frontend setup, and
**[docs/SHEETS_SCHEMA.md](docs/SHEETS_SCHEMA.md)** for the data model.

```bash
npm install
npm run dev
```

## Structure

```
backend/            Backend.gs — the deployed Google Apps Script (API + data bridge)
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
