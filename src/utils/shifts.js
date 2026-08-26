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

// Format a money value for display, e.g. "45 €". Non-numeric values pass through
// unchanged; empty -> ''. Currency symbol comes from config (spec §90).
export function formatMoney(value) {
  if (value == null) return ''
  const s = String(value).trim()
  if (!s) return ''
  return /^\d+([.,]\d+)?$/.test(s) ? `${s} ${CONFIG.currencySymbol}` : s
}

// Shift payment (СМЯНА) display — same formatting as any money value.
export const formatPayment = formatMoney

// Sort order for a location panel: full-day shifts before evening (spec §8).
export function shiftSortRank(type) {
  if (type === 'full') return 0
  if (type === 'evening') return 1
  return 2
}
