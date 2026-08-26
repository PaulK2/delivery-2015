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

// Maintenance severity (spec §39). Ordered most-severe first for sorting/forms.
export const SEVERITY = {
  critical: { label: 'Критично', cls: 'danger', rank: 0, hint: 'Автомобилът не трябва да се използва.' },
  medium: { label: 'Средно', cls: 'warn', rank: 1, hint: 'Автомобилът се нуждае от внимание.' },
  low: { label: 'Ниско', cls: 'muted', rank: 2, hint: 'Автомобилът може да се използва.' },
}
export const SEVERITY_ORDER = ['low', 'medium', 'critical']

export function severityRank(s) {
  return SEVERITY[s]?.rank ?? 9
}

// Maintenance categories (spec §38). Internal value → Bulgarian label.
export const MAINTENANCE_CATEGORY = {
  engine: 'Двигател',
  tires: 'Гуми',
  brakes: 'Спирачки',
  lights: 'Светлини',
  body: 'Купе',
  interior: 'Интериор',
  electronics: 'Електроника',
  fluids: 'Течности',
  documents: 'Документи',
  other: 'Друг проблем',
}
export const CATEGORY_ORDER = Object.keys(MAINTENANCE_CATEGORY)

export function categoryLabel(c) {
  return MAINTENANCE_CATEGORY[c] || c || ''
}
