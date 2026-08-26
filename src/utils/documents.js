// Vehicle documents / deadlines (spec §46–§50). A reusable model: insurance and
// annual inspection are just two `type` values among several.
import { CONFIG } from '../config/index.js'
import { daysUntil } from './datetime.js'

// Document type -> Bulgarian label. Not limited to insurance/inspection (spec §49).
export const DOC_TYPE = {
  inspection: 'Годишен технически преглед',
  insurance: 'Застраховка',
  vignette: 'Винетка',
  road_tax: 'Данък',
  casco: 'Каско',
  service: 'Обслужване',
  oil: 'Смяна на масло',
  tires: 'Гуми',
  other: 'Друг документ',
}
export const DOC_TYPE_ORDER = Object.keys(DOC_TYPE)

export function docTypeLabel(t) {
  return DOC_TYPE[t] || t || 'Документ'
}

function dayWord(n) {
  return Math.abs(n) === 1 ? 'ден' : 'дни'
}

// Compute a document's status from its valid-until date (spec §47).
// Returns { state: 'valid'|'soon'|'expired'|'none', days, label, cls }.
export function computeDocStatus(validUntil, warningDays) {
  const days = daysUntil(validUntil)
  if (days == null) {
    return { state: 'none', days: null, label: '', cls: 'muted' }
  }
  const threshold = Number(warningDays) > 0 ? Number(warningDays) : CONFIG.documentWarningDays

  if (days < 0) {
    return { state: 'expired', days, label: 'Изтекъл', cls: 'danger' }
  }
  if (days <= threshold) {
    return {
      state: 'soon',
      days,
      label: days === 0 ? 'Изтича днес' : `Изтича след ${days} ${dayWord(days)}`,
      cls: 'warn',
    }
  }
  return { state: 'valid', days, label: `Валиден – още ${days} ${dayWord(days)}`, cls: 'ok' }
}
