import { useMemo, useState } from 'react'
import { weekdayNameByIndex, weekdayIndex, formatDateBG } from '../utils/datetime.js'

// Admin availability controls (spec §23): open/close, active week, per-day counts,
// and who has not submitted yet.
export default function AdminAvailabilityPanel({
  open,
  weekStart,
  dates,
  availability,
  employees,
  busy,
  onToggleOpen,
  onSetWeek,
}) {
  const [weekInput, setWeekInput] = useState(weekStart)

  const perDay = useMemo(() => {
    const map = {}
    for (const d of dates) map[d] = { full: 0, evening: 0 }
    for (const r of availability) {
      if (map[r.date]) map[r.date][r.shift_type] = (map[r.date][r.shift_type] || 0) + 1
    }
    return map
  }, [dates, availability])

  const submittedIds = useMemo(
    () => new Set(availability.map((r) => r.employee_id)),
    [availability]
  )
  const notSubmitted = employees.filter((e) => !submittedIds.has(e.employee_id))

  return (
    <section className="admin-panel">
      <h2 className="admin-panel__title">Управление на приема</h2>

      <div className="admin-panel__row">
        <div>
          <div className="admin-panel__label">Статус на приема</div>
          <div className={'pill ' + (open ? 'pill--ok' : 'pill--muted')}>
            {open ? 'Отворен' : 'Затворен'}
          </div>
        </div>
        <button
          className={'btn btn--sm ' + (open ? 'btn--ghost' : 'btn--primary')}
          disabled={busy}
          onClick={() => onToggleOpen(!open)}
        >
          {open ? 'Затвори приема' : 'Отвори приема'}
        </button>
      </div>

      <div className="admin-panel__row">
        <label className="field admin-panel__week">
          <span className="field__label">Активна седмица (понеделник)</span>
          <input
            className="input input--sm"
            type="date"
            value={weekInput}
            onChange={(e) => setWeekInput(e.target.value)}
          />
        </label>
        <button
          className="btn btn--ghost btn--sm"
          disabled={busy || !weekInput || weekInput === weekStart}
          onClick={() => onSetWeek(weekInput)}
        >
          Задай седмица
        </button>
      </div>

      <div className="admin-panel__counts">
        <div className="admin-panel__label">Наличност по дни</div>
        <div className="count-grid">
          {dates.map((d) => (
            <div key={d} className="count-cell">
              <div className="count-cell__day">
                {weekdayNameByIndex(weekdayIndex(d)).slice(0, 3)} {formatDateBG(d).slice(0, 5)}
              </div>
              <div className="count-cell__nums">
                <span className="count-cell__full">{perDay[d]?.full || 0}</span>
                <span className="count-cell__evening">{perDay[d]?.evening || 0}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="count-legend">
          <span className="count-cell__full">■</span> Цяла ·{' '}
          <span className="count-cell__evening">■</span> Вечерна
        </div>
      </div>

      <div className="admin-panel__missing">
        <div className="admin-panel__label">
          Неподали наличност ({notSubmitted.length})
        </div>
        {notSubmitted.length === 0 ? (
          <div className="empty-state empty-state--sm">Всички служители са подали.</div>
        ) : (
          <div className="chip-list">
            {notSubmitted.map((e) => (
              <span key={e.employee_id} className="chip">
                {e.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
