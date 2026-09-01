import { useEffect, useMemo, useState } from 'react'
import { getArchivedSchedule } from '../../services/schedule/schedule.js'
import { weekdayNameByIndex, WEEK_ORDER, scheduleDate, formatDateBG } from '../../utils/datetime.js'
import { shiftHours, shiftSortRank, formatPayment, SHIFT_LABELS } from '../../utils/shifts.js'
import { resolveScheduleCar } from '../../utils/vehicles.js'
import { locationOrderRank } from '../../config/index.js'
import Modal from '../Modal.jsx'
import Spinner from '../Spinner.jsx'

// Read-only view of one archived week's schedule grid — reuses the same day/location
// grouping and CSS classes as the "Цял график" view on SchedulePage, so it looks and
// behaves consistently without any new styling.
export default function ScheduleArchiveViewer({ link, onClose }) {
  const [state, setState] = useState({ loading: true, error: '', entries: [] })
  const [openDays, setOpenDays] = useState(() => new Set())

  useEffect(() => {
    let alive = true
    getArchivedSchedule(link.archive_id)
      .then(({ entries }) => {
        if (!alive) return
        setState({ loading: false, error: '', entries })
        // Open every day by default — this is a one-off lookup, not a daily-use view.
        setOpenDays(new Set(WEEK_ORDER))
      })
      .catch((e) => alive && setState({ loading: false, error: e.message || 'Грешка при зареждане.', entries: [] }))
    return () => {
      alive = false
    }
  }, [link.archive_id])

  const toggleDay = (wd) =>
    setOpenDays((prev) => {
      const next = new Set(prev)
      next.has(wd) ? next.delete(wd) : next.add(wd)
      return next
    })

  // Same grouping as SchedulePage's "Цял график": weekday → location → entries.
  const byWeekday = useMemo(() => {
    const days = new Map()
    for (const e of state.entries) {
      if (!days.has(e.weekday)) days.set(e.weekday, new Map())
      const locs = days.get(e.weekday)
      if (!locs.has(e.location_name)) locs.set(e.location_name, [])
      locs.get(e.location_name).push(e)
    }
    const result = []
    for (const wd of WEEK_ORDER) {
      if (!days.has(wd)) continue
      const locs = days.get(wd)
      const locList = [...locs.keys()]
        .sort((a, b) => locationOrderRank(a) - locationOrderRank(b) || a.localeCompare(b, 'bg'))
        .map((locName) => {
          const list = locs
            .get(locName)
            .sort(
              (a, b) =>
                shiftSortRank(a.shift_type) - shiftSortRank(b.shift_type) ||
                a.employee_name.localeCompare(b.employee_name, 'bg')
            )
          return [locName, list]
        })
      const sample = locList[0]?.[1]?.[0]
      const dateISO = sample ? scheduleDate(wd, sample.day_number) : ''
      const count = locList.reduce((n, [, list]) => n + list.length, 0)
      result.push([wd, { dateISO, count, locList }])
    }
    return result
  }, [state.entries])

  return (
    <Modal title={link.label} onClose={onClose}>
      {state.loading ? (
        <Spinner label="Зареждане на графика…" />
      ) : state.error ? (
        <div className="banner banner--error" role="alert">
          {state.error}
        </div>
      ) : byWeekday.length === 0 ? (
        <div className="empty-state empty-state--sm">Няма записи в тази връзка.</div>
      ) : (
        <div className="schedule-days">
          {byWeekday.map(([wd, { dateISO, count, locList }]) => {
            const isOpen = openDays.has(wd)
            return (
              <section key={wd} className={'schedule-day' + (isOpen ? ' schedule-day--open' : '')}>
                <button
                  type="button"
                  className="schedule-day__head"
                  aria-expanded={isOpen}
                  onClick={() => toggleDay(wd)}
                >
                  <span
                    className={'schedule-day__chevron' + (isOpen ? ' schedule-day__chevron--open' : '')}
                    aria-hidden="true"
                  >
                    ▸
                  </span>
                  <span className="schedule-day__weekday">{weekdayNameByIndex(wd)}</span>
                  {dateISO ? <span className="schedule-day__date">{formatDateBG(dateISO)}</span> : null}
                  <span className="schedule-day__count">{count}</span>
                </button>

                {isOpen
                  ? locList.map(([locName, entries]) => (
                      <div key={locName} className="schedule-loc schedule-loc--open">
                        <div className="schedule-loc__head">
                          <span className="schedule-loc__name">{locName}</span>
                          <span className="schedule-loc__count">{entries.length}</span>
                        </div>
                        <ul className="schedule-list">
                          {entries.map((e) => {
                            const car = resolveScheduleCar(e.car, [])
                            return (
                              <li key={e.schedule_id} className={'schedule-item schedule-item--' + e.shift_type}>
                                <span className="schedule-item__person">{e.employee_name}</span>
                                <span className="schedule-item__shift">{SHIFT_LABELS[e.shift_type]}</span>
                                {car?.plate ? <span className="schedule-item__car">{car.plate}</span> : null}
                                {formatPayment(e.payment) ? (
                                  <span className="schedule-item__pay">{formatPayment(e.payment)}</span>
                                ) : null}
                                <span className="schedule-item__hours">{shiftHours(e.shift_type)}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))
                  : null}
              </section>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
