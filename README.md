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
- Vehicles (Phase 2): fleet list with plate search + status summary, vehicle detail
  page, take / release (with parking form), double-reservation prevention, usage
  history with period presets, read-only active-issues section, toast notifications
- Availability (Phase 3): next-week matrix (none/full/evening per day, single-select),
  save own availability, team overview matrix, admin open/close + active-week +
  per-day counts + who-hasn't-submitted
- Maintenance (Phase 4): report issue (category/severity), prominent active issues,
  critical auto-blocks the vehicle + admin restore-to-service, admin resolve with
  repair details, per-vehicle repair history, global Сигнали и поддръжка page with
  filters (status/severity/category/plate)
- Documents (Phase 5): reusable VehicleDocument model (insurance, annual inspection,
  vignette, road tax, casco, …) with 🟢/🟡/🔴 valid/expiring/expired status per
  configurable warning threshold; admin add/edit per vehicle; admin "Предстоящи
  срокове" widget on Home sorted by nearest expiry
- Administration + PWA + search (Phase 6): admin-only `/admin` with tabbed dashboard
  (fleet/issues/documents/availability counters) and CRUD for employees (add/edit,
  role, active, initial + reset PIN), vehicles (add/edit incl. inactive), and work
  locations; app-wide quick search (header 🔍 or the `/` key) that jumps to a vehicle
  by plate/make/model; installable PWA — web manifest, icon, `theme-color`, and a
  stale-while-revalidate service worker for the app shell (registered in production)

> Phase 3 added two backend actions (`getAvailabilityStatus`, `setAvailabilityWeek`)
> and a date normalizer in `Backend.gs` — **redeploy the Apps Script** for accurate
> open/close state, week selection, and duplicate-free re-saves. The frontend degrades
> gracefully until then (normalizes dates client-side; assumes the period is open).

All frontend phases (1–6) are now wired end-to-end against the existing backend.

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
  components/       layout, nav, map, panels, admin/, global search, shared UI
  pages/            Home, Schedule, Availability, Vehicles, Maintenance, Admin, Login
  utils/            Bulgarian date/time, shift helpers
  styles/           design system (global.css)
docs/               setup + sheet schema
```
