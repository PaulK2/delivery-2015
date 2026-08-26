import { weekdayNameByIndex, weekdayIndex, formatDateBG } from '../utils/datetime.js'

// One day's availability choice. A single-select segmented control makes it
// impossible to pick full + evening for the same day (spec §18, §19).
const OPTIONS = [
  { value: 'none', label: 'Не работя', cls: 'none' },
  { value: 'full', label: 'Цяла смяна', cls: 'full' },
  { value: 'evening', label: 'Вечерна смяна', cls: 'evening' },
]

export default function DayShiftSelector({ date, value, onChange, disabled }) {
  return (
    <div className="day-select">
      <div className="day-select__head">
        <span className="day-select__weekday">{weekdayNameByIndex(weekdayIndex(date))}</span>
        <span className="day-select__date">{formatDateBG(date)}</span>
      </div>
      <div className="segmented" role="group" aria-label={formatDateBG(date)}>
        {OPTIONS.map((o) => {
          const active = (value || 'none') === o.value
          return (
            <button
              key={o.value}
              type="button"
              className={
                'segmented__btn segmented__btn--' + o.cls + (active ? ' is-active' : '')
              }
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
