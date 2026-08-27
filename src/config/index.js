// Central application configuration.
// Per spec §89/§90: shift times, map center, warning thresholds, API URL, timezone
// all live here — never hardcoded across components.

// The Apps Script Web App URL is NOT a secret (secrets stay inside Apps Script).
// Priority: localStorage override (set by admin) > build-time env var > empty.
const STORED_API_URL = safeLocalStorage('fv_api_url')

export const API_URL =
  STORED_API_URL ||
  import.meta.env.VITE_API_URL ||
  '' // must be configured before the backend works — see docs/SETUP.md

export function setApiUrl(url) {
  try {
    if (url) localStorage.setItem('fv_api_url', url.trim())
    else localStorage.removeItem('fv_api_url')
  } catch {
    /* ignore storage errors */
  }
}

export const CONFIG = {
  appName: 'Delivery 2015',
  organization: 'автопарк',
  timezone: 'Europe/Sofia',
  locale: 'bg-BG',
  currencySymbol: '€',

  // Sofia map defaults
  map: {
    defaultLat: 42.6977,
    defaultLng: 23.3219,
    defaultZoom: 12,
    focusZoom: 15, // zoom applied when focusing the user's restaurant for today
    minZoom: 10,
    maxZoom: 19,
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },

  // Shift definitions (spec §9, §89)
  shifts: {
    full: { start: '11:00', end: '23:00', color: '#F97316', label: 'Цяла смяна' },
    evening: { start: '17:00', end: '23:00', color: '#EAB308', label: 'Вечерна смяна' },
  },

  // Warning threshold for documents/inspections in days (spec §47)
  documentWarningDays: 30,

  // Distance (km) since the last oil change after which a car is flagged (soft).
  oilChangeIntervalKm: 10000,

  // Operational data auto-refresh interval in ms (spec §80)
  autoRefreshMs: 45000,

  // Connection reliability (transient Apps Script/network hiccups shouldn't look
  // like a full outage). A request is aborted after `requestTimeoutMs`; idempotent
  // reads are retried with the `retryBackoffMs` delays before the call is treated
  // as failed. The soft "retrying" banner shows after the first failed cycle; the
  // stronger "no connection" banner only after `strongFailureThreshold` consecutive
  // failed cycles.
  net: {
    requestTimeoutMs: 20000,
    retryBackoffMs: [1000, 2500], // first retry ~1s, second ~2.5s
    strongFailureThreshold: 3,
  },

  // Special built-in "own car". Always available, no take/park, no maintenance or
  // documents. Whoever drives it earns a flat bonus on top of the shift payment.
  ownCar: {
    id: 'OWN',
    label: 'Собствена кола',
    payBonus: 5, // €, e.g. 45 → 50, 24 → 29
  },
}

// Canonical model per make (keeps displayed models consistent regardless of what
// the Google Sheet holds). Keys are lower-cased, accent-insensitive makes. An empty
// string means "make only, no model" (e.g. Škoda). Makes not listed keep their own
// model (e.g. Renault → Clio/Scénic).
export const MODEL_BY_MAKE = {
  toyota: 'Aygo',
  citroen: 'C1',
  suzuki: 'Swift',
  kia: 'Picanto',
  seat: 'Ibiza',
  skoda: '',
  chevrolet: 'Aveo',
  opel: 'Astra',
  peugeot: '107',
}

// Brand palette (spec §68)
export const COLORS = {
  accent: '#F97316', // orange — primary
  evening: '#EAB308', // yellow — evening shifts
  ok: '#16A34A', // green — available / valid
  danger: '#DC2626', // red — critical / error / expired
  warn: '#D97706', // amber — expiring soon
  muted: '#6B7280', // gray — secondary
}

function safeLocalStorage(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
