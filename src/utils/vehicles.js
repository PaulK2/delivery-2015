// Vehicle status helpers (spec §25). Internal machine values → Bulgarian labels.
import { CONFIG, MODEL_BY_MAKE } from '../config/index.js'

export const CAR_STATUS = {
  available: { label: 'Свободен', cls: 'ok', dot: '🟢' },
  in_use: { label: 'В движение', cls: 'accent', dot: '🟠' },
  maintenance: { label: 'Недостъпен', cls: 'danger', dot: '🔴' },
  inactive: { label: 'Неактивен', cls: 'muted', dot: '⚫' },
}

export function carStatus(status) {
  return CAR_STATUS[status] || CAR_STATUS.inactive
}

// Authoritative make/model for the 10 photographed vehicles, keyed by (Latin) plate.
// This is the source of truth for those cars: it overrides whatever the Google Sheet
// happens to hold, so the displayed name always matches the bundled photo. It also
// backs the photo lookup below. Renaults keep their real model (not in MODEL_BY_MAKE).
export const FLEET_CATALOG = {
  CB0254CO: { make: 'Citroen', model: 'C1' },
  CB3989KO: { make: 'Citroen', model: 'C1' },
  CB8361CH: { make: 'Citroen', model: 'C1' },
  CB1975BE: { make: 'Citroen', model: 'C1' },
  CB0668CC: { make: 'Seat', model: 'Ibiza' },
  CB1950TP: { make: 'Chevrolet', model: 'Aveo' },
  CB2333CP: { make: 'Peugeot', model: '107' },
  CB3297TA: { make: 'Suzuki', model: 'Swift' },
  CB0927AA: { make: 'Renault', model: 'Scenic' },
  CB7052CB: { make: 'Renault', model: 'Clio' },
  CB7920BC: { make: 'Renault', model: 'Clio' },
  // Newly photographed vehicles (brand/model read from the photos).
  CB0065TM: { make: 'Toyota', model: 'Aygo' },
  CB4349CB: { make: 'Toyota', model: 'Aygo' },
  CB2587CH: { make: 'Peugeot', model: '107' },
  CB9221CT: { make: 'Peugeot', model: '107' },
  CB2804TA: { make: 'Citroen', model: 'C1' },
  CB9206AP: { make: 'Opel', model: 'Astra' },
  CB3259KC: { make: 'Seat', model: 'Ibiza' },
  // Clones of CB0254CO (Citroen C1) — same vehicle, reused photo.
  CB1060BN: { make: 'Citroen', model: 'C1' },
  CB6300KM: { make: 'Citroen', model: 'C1' },
  CB5737PX: { make: 'Citroen', model: 'C1' },
}

function catalogEntry(car) {
  return FLEET_CATALOG[normalizePlate(car?.registration)] || null
}

// Lower-cased, diacritic-free make key (Citroën→citroen, Škoda→skoda). The regex is
// built from an escaped string so the combining-mark range survives editing intact.
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
function makeKey(make) {
  return String(make || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
}

// Canonical model for a make (keeps displayed models consistent regardless of the
// Google Sheet). Makes not in the map keep their own model.
export function canonicalModel(car) {
  const key = makeKey(car?.make)
  return key in MODEL_BY_MAKE ? MODEL_BY_MAKE[key] : car?.model || ''
}

// A short display title for a car: "Make Model" or the plate as fallback. For the
// photographed fleet the catalog wins (so the label matches the photo); otherwise the
// Sheet's make + its canonical model are used.
export function carTitle(car) {
  const entry = catalogEntry(car)
  const make = entry ? entry.make : car?.make
  const model = entry ? entry.model : canonicalModel(car)
  const mm = [make, model].filter(Boolean).join(' ').trim()
  return mm || car?.registration || '—'
}

// Registration normalized for matching / photo lookup ("CB 0254 CO" → "CB0254CO").
// Bulgarian plates use letters shared by the Cyrillic and Latin alphabets, so the
// same plate can be typed either way (e.g. Cyrillic СВ… vs Latin CB…). Fold the
// look-alike Cyrillic letters to their Latin twin so both forms compare equal.
const CYRILLIC_TO_LATIN = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H',
  О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X',
}

export function normalizePlate(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/[А-Я]/g, (ch) => CYRILLIC_TO_LATIN[ch] || ch)
}

// Plates that have a bundled photo in /public/cars — derived from the fleet catalog
// so photo and label always agree. Cars without a photo fall back to the placeholder.
export const CAR_PHOTO_PLATES = new Set(Object.keys(FLEET_CATALOG))

// Resolve a car's photo: explicit image URL wins, else a bundled photo by plate.
export function carPhoto(car) {
  if (car?.image) return car.image
  const plate = normalizePlate(car?.registration)
  return CAR_PHOTO_PLATES.has(plate) ? `${import.meta.env.BASE_URL}cars/${plate}.png` : null
}

// Bulgarian plates only use the twelve letters shared by the Cyrillic and Latin
// alphabets. After normalizePlate() folds everything to Latin, a valid plate token
// is 1–2 of these letters, four digits, then 0–2 of these letters. Restricting the
// letter class to this set makes the extractor stop at noise words ("резерва",
// "note", …) instead of swallowing them.
const PLATE_LETTERS = 'ABEKMHOPCTYX'
const PLATE_TOKEN_RE = new RegExp(
  `([${PLATE_LETTERS}]{1,2})([0-9]{4})([${PLATE_LETTERS}]{0,2})`
)

// Pull the registration plate out of a free-text schedule note and match it to a
// real car, tolerating extra text and truncation. `known` is a list of
// { car_id, plate } where `plate` has already been run through normalizePlate().
//
// Returns { plate, carId, completed } — carId is null when a plate-like token was
// found but matches no (single) car; completed is true when we filled in missing
// trailing characters. Returns null when there is no plate-like token at all.
export function resolveScheduleCar(rawCar, known) {
  const folded = normalizePlate(rawCar) // Cyrillic→Latin, upper-cased, spaces stripped
  const m = folded.match(PLATE_TOKEN_RE)
  if (!m) return null

  const cand = m[1] + m[2] + m[3]
  const coreLen = m[1].length + 4 // region letters + the four digits (the identifier)

  // Walk from the fullest candidate down to just region+digits. A car matches when
  // the candidate is a prefix of its plate with at most two characters missing.
  for (let len = cand.length; len >= coreLen; len--) {
    const sub = cand.slice(0, len)
    const hits = (known || []).filter(
      (k) => k.plate && k.plate.startsWith(sub) && k.plate.length - sub.length <= 2
    )
    if (hits.length === 1) {
      return { plate: hits[0].plate, carId: hits[0].car_id, completed: hits[0].plate !== cand }
    }
    if (hits.length > 1) break // ambiguous — a shorter prefix only matches more cars
  }

  return { plate: cand, carId: null, completed: false } // plate-like, but no unique car
}

// The special built-in "own car" (spec: собствена кола).
export function isOwnCar(car) {
  return !!car && (car.own === true || car.car_id === CONFIG.ownCar.id)
}

function toNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

// Oil-change status for a car. Prefers the server-computed fields but falls back to
// computing from the odometer values so it works before the backend is redeployed.
export function oilInfo(car) {
  const interval = CONFIG.oilChangeIntervalKm
  const lastOdo = toNum(car?.last_odometer)
  const lastOilOdo = toNum(car?.last_oil_change_odometer)
  const km =
    car?.km_since_oil_change != null
      ? toNum(car.km_since_oil_change)
      : lastOdo != null && lastOilOdo != null
        ? lastOdo - lastOilOdo
        : null
  const due = car?.oil_change_due === true || (km != null && km >= interval)
  return {
    interval,
    lastOdo,
    lastOilOdo,
    lastOilDate: car?.last_oil_change_date || '',
    km,
    due,
    remaining: km != null ? interval - km : null,
    // true only when we actually have oil-change history to show
    tracked: lastOilOdo != null || !!car?.last_oil_change_date,
  }
}

export function makeOwnCar() {
  return {
    car_id: CONFIG.ownCar.id,
    registration: CONFIG.ownCar.label,
    make: '',
    model: '',
    year: '',
    image: '',
    status: 'available',
    active: true,
    own: true,
  }
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
