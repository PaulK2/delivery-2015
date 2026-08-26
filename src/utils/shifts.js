// Shift-type helpers. Internal values are 'full' | 'evening' (spec §9, §14).
import { CONFIG } from '../config/index.js'

export const SHIFT_LABELS = {
  full: 'Цяла смяна',
  evening: 'Вечерна смяна',
  none: 'Не работя',
}

// Short badge labels for dense views (spec §22).
export const SHIFT_BADGES = {
  full: 'Цяла',
  evening: 'Вечер',
}

export function shiftColor(type) {
  return CONFIG.shifts[type]?.color || CONFIG.shifts.full.color
}

export function shiftHours(type) {
  const s = CONFIG.shifts[type]
  return s ? `${s.start} – ${s.end}` : ''
}

export function shiftLabel(type) {
  return SHIFT_LABELS[type] || type || ''
}

// Format a shift payment (СМЯНА) for display, e.g. "45 лв". Returns '' when empty.
export function formatPayment(payment) {
  if (payment == null) return ''
  const s = String(payment).trim()
  if (!s) return ''
  return /^\d+([.,]\d+)?$/.test(s) ? `${s} лв` : s
}

// Sort order for a location panel: full-day shifts before evening (spec §8).
export function shiftSortRank(type) {
  if (type === 'full') return 0
  if (type === 'evening') return 1
  return 2
}
