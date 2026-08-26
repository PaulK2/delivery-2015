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
  appName: 'Автопарк',
  organization: 'delivery-2015',
  timezone: 'Europe/Sofia',
  locale: 'bg-BG',

  // Sofia map defaults
  map: {
    defaultLat: 42.6977,
    defaultLng: 23.3219,
    defaultZoom: 12,
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

  // Operational data auto-refresh interval in ms (spec §80)
  autoRefreshMs: 45000,
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
