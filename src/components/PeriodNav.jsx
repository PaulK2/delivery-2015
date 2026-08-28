import {
  shiftISO,
  todayISO,
  formatDateBG,
  weekdayBG,
  mondayOfWeekISO,
  weekRangeLabel,
} from '../utils/datetime.js'

// One consistent period navigator used across every screen that steps through time,
// so the control looks and behaves the same everywhere (day or week). Defaults to the
// current period; the reset button only appears when you've navigated away from it.
export default function PeriodNav({ mode = 'day', value, onChange }) {
  const week = mode === 'week'
  const step = week ? 7 : 1
  const current = week ? mondayOfWeekISO(todayISO()) : todayISO()
  const isCurrent = value === current
  const label = week ? weekRangeLabel(value) : `${weekdayBG(value)}, ${formatDateBG(value)}`
  const prevLabel = week ? 'Предишна седмица' : 'Предишен ден'
  const nextLabel = week ? 'Следваща седмица' : 'Следващ ден'
  const resetLabel = week ? 'Тази седмица' : 'Днес'

  return (
    <div className="period-nav">
      <button
        type="button"
        className="period-nav__arrow"
        onClick={() => onChange(shiftISO(value, -step))}
        aria-label={prevLabel}
      >
        ‹
      </button>
      <div className="period-nav__center">
        <span className="period-nav__label">{label}</span>
        {!isCurrent ? (
          <button type="button" className="period-nav__today" onClick={() => onChange(current)}>
            {resetLabel}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="period-nav__arrow"
        onClick={() => onChange(shiftISO(value, step))}
        aria-label={nextLabel}
      >
        ›
      </button>
    </div>
  )
}
