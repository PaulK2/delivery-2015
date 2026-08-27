import { formatDateBG } from '../utils/datetime.js'
import {
  shiftSortRank,
  shiftHours,
  paymentWithOwnCarBonus,
  isOwnCarAssignment,
  SHIFT_BADGES,
} from '../utils/shifts.js'

// Location details panel (spec §8). Employees sorted full-day before evening.
export default function LocationDetailPanel({ location, entries, date, onClose }) {
  if (!location) return null

  const sorted = [...entries].sort(
    (a, b) => shiftSortRank(a.shift_type) - shiftSortRank(b.shift_type)
  )

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
                {e.car ? (
                  <span className="employee-row__car">
                    {' '}· {isOwnCarAssignment(e.car) ? '🔑 ' : ''}
                    {e.car}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
