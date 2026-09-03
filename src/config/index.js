// Central application configuration.
// Per spec §89/§90: shift times, map center, warning thresholds, API URL, timezone
// all live here — never hardcoded across components.

// The backend is the Worker deployed alongside this same app (see worker/), reachable
// same-origin at /api in both local dev (the Cloudflare Vite plugin) and production —
// no external URL to configure. The localStorage override remains as an escape hatch
// (e.g. pointing a local frontend at a different deployed Worker).
const STORED_API_URL = safeLocalStorage('fv_api_url')

export const API_URL = STORED_API_URL || '/api'

export function setApiUrl(url) {
  try {
    if (url) localStorage.setItem('fv_api_url', url.trim())
    else localStorage.removeItem('fv_api_url')
  } catch {
    /* ignore storage errors */
  }
}

// Bump on each deploy so we can confirm which frontend build is actually live (shown
// to admins in Още, and logged to the console at startup).
export const APP_VERSION = 'ui-2026-09-03-roadbook'

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
    // Apps Script sporadically returns 503 (Service Unavailable) under load — especially
    // for the heavier schedule read. Give idempotent reads several, increasingly patient
    // retries so a brief server-side blip recovers instead of surfacing as an error.
    retryBackoffMs: [1000, 3000, 6000], // ~1s, ~3s, ~6s
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

// ---- Orders / payroll / reports (Major Feature Update) ----

// Each completed delivery order is worth this much toward weekly pay (§7).
export const ORDER_RATE_EUR = 0.5

// Admins who ALSO work shifts (§48) — kept in sync with the backend's
// AVAILABILITY_WORKER_ADMINS. Used to build the payroll roster on the client.
export const WORKER_ADMIN_NAMES = ['ПАВЕЛ', 'В. ПЕТКОВ']

// Whether an employee counts as a "worker" (earns pay, appears on payroll): everyone
// except review-only admins. Mirrors the backend canSubmitAvailability capability.
export function isWorkerEmployee(role, name) {
  if (role !== 'admin') return true
  const key = String(name || '').toLowerCase().replace(/\s+/g, '')
  return WORKER_ADMIN_NAMES.some((n) => n.toLowerCase().replace(/\s+/g, '') === key)
}

// Safety equipment confirmed when a car is taken (§22). `key` matches the UsageHistory
// column names the backend stores; `label` is the Bulgarian UI text.
export const SAFETY_EQUIPMENT = [
  { key: 'has_fire_extinguisher', label: 'Пожарогасител' },
  { key: 'has_first_aid_kit', label: 'Аптечка' },
  { key: 'has_warning_triangle', label: 'Триъгълник' },
  { key: 'has_safety_vest', label: 'Жилетка' },
]

// Delivery / payment categories for the daily report (§27–§29). `key` is the stored
// (internal, English) value; `label` is the Bulgarian UI text. Kept in ONE place so a
// per-restaurant override is a data change, not new UI code.
export const DELIVERY_TYPES = [
  { key: 'restaurant_cash', label: 'Ресторант Кеш' },
  { key: 'restaurant_card', label: 'Ресторант Карта' },
  { key: 'glovo_cash', label: 'Glovo Кеш' },
  { key: 'glovo_card', label: 'Glovo Карта' },
  { key: 'bolt', label: 'Bolt' },
  { key: 'wolt_cash', label: 'Wolt Кеш' },
  { key: 'wolt_card', label: 'Wolt Карта' },
]

// Per-restaurant delivery-type overrides. All six restaurants currently share the same
// categories, so this stays empty; add `'<lowercased name>': [ ...types ]` to specialize
// one restaurant later without touching any component.
export const DELIVERY_TYPES_BY_RESTAURANT = {}

const restaurantKey = (name) =>
  String(name || '').toLowerCase().replace(/\s+/g, ' ').trim()

// The ordered delivery categories that apply to a given restaurant.
export function deliveryTypesForRestaurant(name) {
  return DELIVERY_TYPES_BY_RESTAURANT[restaurantKey(name)] || DELIVERY_TYPES
}

// Label lookup for a stored delivery-type key (falls back to the key itself).
export function deliveryTypeLabel(key) {
  const found = DELIVERY_TYPES.find((t) => t.key === key)
  return found ? found.label : key
}

// Canonical display order of the work locations (spec order, not alphabetical).
// Keys are lower-cased, space-collapsed names; anything not listed sorts after these.
export const LOCATION_ORDER = [
  'пирин',
  'гоце делчев',
  'черковна',
  'студентски град',
  'студентски град 2',
  'младост',
]

// Rank a location name against LOCATION_ORDER (case/space-insensitive). Unlisted
// locations get a rank past the end so they fall to the bottom.
export function locationOrderRank(name) {
  const key = String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  const i = LOCATION_ORDER.indexOf(key)
  return i === -1 ? LOCATION_ORDER.length : i
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
