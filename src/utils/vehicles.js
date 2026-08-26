// Vehicle status helpers (spec §25). Internal machine values → Bulgarian labels.

export const CAR_STATUS = {
  available: { label: 'Свободен', cls: 'ok', dot: '🟢' },
  in_use: { label: 'В движение', cls: 'accent', dot: '🟠' },
  maintenance: { label: 'Недостъпен', cls: 'danger', dot: '🔴' },
  inactive: { label: 'Неактивен', cls: 'muted', dot: '⚫' },
}

export function carStatus(status) {
  return CAR_STATUS[status] || CAR_STATUS.inactive
}

// A short display title for a car: "Make Model" or the plate as fallback.
export function carTitle(car) {
  const mm = [car.make, car.model].filter(Boolean).join(' ').trim()
  return mm || car.registration || '—'
}

// Maintenance severity labels (spec §39) — used when showing active issues.
export const SEVERITY = {
  low: { label: 'Ниско', cls: 'muted' },
  medium: { label: 'Средно', cls: 'warn' },
  critical: { label: 'Критично', cls: 'danger' },
}
