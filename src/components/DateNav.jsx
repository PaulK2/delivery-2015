import { shiftISO, todayISO, formatDateBG, weekdayBG } from '../utils/datetime.js'

// Date navigation for the Home page (spec §10).
export default function DateNav({ date, onChange }) {
  const isToday = date === todayISO()
  return (
    <div className="date-nav">
      <button
        className="btn btn--ghost btn--sm"
        onClick={() => onChange(shiftISO(date, -1))}
        aria-label="Предишен ден"
      >
        ‹ Предишен
      </button>

      <div className="date-nav__center">
        <div className="date-nav__weekday">{weekdayBG(date)}</div>
        <div className="date-nav__date">
          <input
            type="date"
            className="date-nav__picker"
            value={date}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            aria-label="Изберете дата"
          />
          <span className="date-nav__display">{formatDateBG(date)}</span>
        </div>
        {!isToday ? (
          <button className="date-nav__today" onClick={() => onChange(todayISO())}>
            Днес
          </button>
        ) : (
          <span className="date-nav__today date-nav__today--current">Днес</span>
        )}
      </div>

      <button
        className="btn btn--ghost btn--sm"
        onClick={() => onChange(shiftISO(date, 1))}
        aria-label="Следващ ден"
      >
        Следващ ›
      </button>
    </div>
  )
}
