import { formatDateBG } from '../utils/datetime.js'
import {
  shiftSortRank,
  shiftHours,
  paymentWithOwnCarBonus,
  isOwnCarAssignment,
  SHIFT_BADGES,
} from '../utils/shifts.js'

const nameKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')

// Plates of app-tracked cars ("Коли") currently checked out by staff scheduled at this
// location — sourced exclusively from the Cars database (never the schedule sheet's
// free-text car notes, which can be stale, abbreviated, or plain wrong).
function carsForEntries(entries, cars) {
  const staff = new Set((entries || []).map((e) => nameKey(e.employee_name)))
  const plates = new Set()
  for (const car of cars || []) {
    if (car.status !== 'in_use') continue
    if (!staff.has(nameKey(car.current_driver_name))) continue
    if (car.registration) plates.add(car.registration)
  }
  return [...plates].sort()
}

// Location details panel (spec §8). Employees sorted full-day before evening.
export default function LocationDetailPanel({ location, entries, date, cars, onClose }) {
  if (!location) return null

  const sorted = [...entries].sort(
    (a, b) => shiftSortRank(a.shift_type) - shiftSortRank(b.shift_type)
  )
  const carPlates = carsForEntries(entries, cars)

  return (
    <aside className="location-panel" aria-label={`Локация ${location.name}`}>
      <div className="location-panel__head">
        <div>
          <h2 className="location-panel__title">{location.name}</h2>
          {location.address ? (
            <p className="location-panel__address">{location.address}</p>
          ) : null}
          <p className="location-panel__date">{formatDateBG(date)}</p>
        </div>
        {onClose ? (
          <button className="location-panel__close" onClick={onClose} aria-label="Затвори">
            ✕
          </button>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state empty-state--sm">
          Няма служители на тази локация за избрания ден.
        </div>
      ) : (
        <ul className="employee-list">
          {sorted.map((e) => (
            <li key={e.schedule_id} className="employee-row">
              <span className="employee-row__name">{e.employee_name || '—'}</span>
              <span
                className={
                  'shift-badge shift-badge--' + (e.shift_type === 'full' ? 'full' : 'evening')
                }
              >
                {SHIFT_BADGES[e.shift_type]}
              </span>
              <span className="employee-row__hours">
                {shiftHours(e.shift_type)}
                {paymentWithOwnCarBonus(e.payment, e.car) ? (
                  <span
                    className={
                      'employee-row__pay' +
                      (isOwnCarAssignment(e.car) ? ' employee-row__pay--bonus' : '')
                    }
                  >
                    {' '}· {paymentWithOwnCarBonus(e.payment, e.car)}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {carPlates.length > 0 ? (
        <div className="location-panel__cars">
          <h3 className="location-panel__cars-title">Коли</h3>
          <ul className="car-plate-list">
            {carPlates.map((plate) => (
              <li key={plate} className="car-plate-list__item">
                {plate}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  )
}
