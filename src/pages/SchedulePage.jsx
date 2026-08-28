import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSchedule } from '../services/schedule/schedule.js'
import { getCars } from '../services/fleet/fleet.js'
import {
  weekdayNameByIndex,
  WEEK_ORDER,
  weekdayIndex,
  todayISO,
  scheduleDate,
  scheduleEntriesForDate,
  formatDateBG,
} from '../utils/datetime.js'
import { shiftHours, shiftSortRank, formatPayment, SHIFT_LABELS } from '../utils/shifts.js'
import { normalizePlate, resolveScheduleCar } from '../utils/vehicles.js'
import { locationOrderRank } from '../config/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import Spinner from '../components/Spinner.jsx'
import ScheduleSourceConfig from '../components/ScheduleSourceConfig.jsx'

const uniqSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bg'))

// Case- and space-insensitive name key (so "Иван  Петров" == "иванпетров").
const nameKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')
// A location dropdown is keyed by its day + name (same restaurant appears on many days).
const locKey = (wd, locName) => `${wd}::${locName}`

// The car note on a schedule row: extract just the plate, link it to the car's card
// when it maps to a real vehicle, and auto-complete truncated plates. Renders nothing
// when the note is empty or contains no plate-like token.
function ScheduleCar({ rawCar, known }) {
  const resolved = useMemo(() => resolveScheduleCar(rawCar, known), [rawCar, known])
  if (!resolved) return null

  if (resolved.carId) {
    return (
      <Link
        to={`/vehicles/${resolved.carId}`}
        className="schedule-item__car schedule-item__car--link"
        title={
          resolved.completed
            ? `Автоматично разпознат автомобил: ${resolved.plate}`
            : `Отвори картона на ${resolved.plate}`
        }
      >
        🚗 {resolved.plate}
      </Link>
    )
  }
  // Plate-like text but no matching car — still show only the cleaned plate.
  return <span className="schedule-item__car">{resolved.plate}</span>
}

export default function SchedulePage() {
  const { isAdmin, user } = useAuth()
  const [data, setData] = useState({ entries: [], locationNames: [], configured: true, sheetName: '' })
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ employee: '', location: '', shift: '' })
  // Which day sections are expanded. Start with today's weekday open; the rest collapse.
  const [openDays, setOpenDays] = useState(() => new Set([weekdayIndex(todayISO())]))
  // Which restaurant dropdowns are expanded. All start collapsed; the location of the
  // user's own shift today is opened once the schedule loads (see the seeding effect).
  const [openLocs, setOpenLocs] = useState(() => new Set())
  const seededLocs = useRef(false)
  // 'mine' = just the logged-in user's shifts (simple list); 'all' = the full grid.
  const [view, setView] = useState('mine')
  const seededView = useRef(false)

  const toggleDay = (wd) =>
    setOpenDays((prev) => {
      const next = new Set(prev)
      next.has(wd) ? next.delete(wd) : next.add(wd)
      return next
    })

  const toggleLoc = (key) =>
    setOpenLocs((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // The dropdown to open by default: the restaurant where the logged-in user has a shift
  // TODAY. Null when they have no shift today → every dropdown stays collapsed.
  const defaultOpenLoc = useMemo(() => {
    if (!user) return null
    const today = todayISO()
    const mine = scheduleEntriesForDate(data.entries, today).find(
      (e) => nameKey(e.employee_name) === nameKey(user.name)
    )
    return mine ? locKey(weekdayIndex(today), mine.location_name) : null
  }, [data.entries, user])

  // Seed the default-open dropdown once, when the schedule first arrives. Guarded so a
  // manual refresh (or the user toggling dropdowns) never re-collapses their view.
  useEffect(() => {
    if (seededLocs.current) return
    if (!data.entries.length) return
    seededLocs.current = true
    setOpenLocs(defaultOpenLoc ? new Set([defaultOpenLoc]) : new Set())
  }, [data.entries, defaultOpenLoc])

  async function load() {
    setLoading(true)
    setError('')
    // Cars are best-effort: the schedule must still render (with cleaned, unlinked
    // plates) even if the fleet list can't be loaded.
    const [sch, carRes] = await Promise.allSettled([getSchedule(), getCars()])
    if (carRes.status === 'fulfilled') setCars(carRes.value)
    if (sch.status === 'fulfilled') {
      setData(sch.value)
    } else {
      setError(sch.reason?.message || 'Графикът не може да бъде зареден.')
    }
    setLoading(false)
  }

  // Known cars keyed by normalized plate, for linking schedule notes to car cards.
  const knownCars = useMemo(
    () =>
      cars
        .map((c) => ({ car_id: c.car_id, plate: normalizePlate(c.registration) }))
        .filter((k) => k.plate),
    [cars]
  )

  useEffect(() => {
    load()
  }, [])

  const employees = useMemo(() => uniqSorted(data.entries.map((e) => e.employee_name)), [data])
  const locations = useMemo(() => uniqSorted(data.entries.map((e) => e.location_name)), [data])

  // The logged-in user's own shifts, grouped by weekday (Monday-first): the simple
  // default view. Empty when they have no shifts in the grid.
  const myByWeekday = useMemo(() => {
    if (!user) return []
    const key = nameKey(user.name)
    const mine = data.entries.filter((e) => nameKey(e.employee_name) === key)
    const days = new Map()
    for (const e of mine) {
      if (!days.has(e.weekday)) days.set(e.weekday, [])
      days.get(e.weekday).push(e)
    }
    const result = []
    for (const wd of WEEK_ORDER) {
      if (!days.has(wd)) continue
      const list = days.get(wd).sort((a, b) => shiftSortRank(a.shift_type) - shiftSortRank(b.shift_type))
      const dateISO = scheduleDate(wd, list[0].day_number)
      result.push([wd, { dateISO, list }])
    }
    return result
  }, [data.entries, user])

  // Default to "my schedule" when the user actually has shifts; otherwise show the full
  // grid (e.g. review-only admins). Seeded once, so toggling afterwards is respected.
  useEffect(() => {
    if (seededView.current) return
    if (!data.entries.length) return
    seededView.current = true
    setView(myByWeekday.length ? 'mine' : 'all')
  }, [data.entries, myByWeekday])

  const filtered = useMemo(() => {
    return data.entries.filter((e) => {
      if (filters.employee && e.employee_name !== filters.employee) return false
      if (filters.location && e.location_name !== filters.location) return false
      if (filters.shift && e.shift_type !== filters.shift) return false
      return true
    })
  }, [data, filters])

  // Group by weekday (Monday-first), then by restaurant, then full-shift before evening
  // within each restaurant (spec §15 — "by day" view). Shape: [ [wd, [ [locName, entries] ] ] ].
  const byWeekday = useMemo(() => {
    const days = new Map()
    for (const e of filtered) {
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
        .sort(
          (a, b) => locationOrderRank(a) - locationOrderRank(b) || a.localeCompare(b, 'bg')
        )
        .map((locName) => {
          const list = locs.get(locName).sort(
            (a, b) =>
              shiftSortRank(a.shift_type) - shiftSortRank(b.shift_type) ||
              a.employee_name.localeCompare(b.employee_name, 'bg')
          )
          return [locName, list]
        })
      // Real date for this weekday, reconstructed from any entry's day number.
      const sample = locList[0]?.[1]?.[0]
      const dateISO = sample ? scheduleDate(wd, sample.day_number) : ''
      const count = locList.reduce((n, [, list]) => n + list.length, 0)
      result.push([wd, { dateISO, count, locList }])
    }
    return result
  }, [filtered])

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">График</h1>
        <button className="btn btn--ghost btn--sm" onClick={load}>
          ↻ Обнови
        </button>
      </div>

      {isAdmin ? <ScheduleSourceConfig onLoaded={load} /> : null}

      {myByWeekday.length ? (
        <div className="segmented">
          <button
            className={'segmented__btn' + (view === 'mine' ? ' segmented__btn--active' : '')}
            onClick={() => setView('mine')}
          >
            Моят график
          </button>
          <button
            className={'segmented__btn' + (view === 'all' ? ' segmented__btn--active' : '')}
            onClick={() => setView('all')}
          >
            Цял график
          </button>
        </div>
      ) : null}

      {view === 'all' ? (
        <details className="filters-details">
          <summary className="filters-details__summary">Филтри</summary>
          <div className="filters">
            <select
              className="input input--sm"
              value={filters.employee}
              onChange={(e) => setFilters((f) => ({ ...f, employee: e.target.value }))}
            >
              <option value="">Всички служители</option>
              {employees.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              className="input input--sm"
              value={filters.location}
              onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
            >
              <option value="">Всички локации</option>
              {locations.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              className="input input--sm"
              value={filters.shift}
              onChange={(e) => setFilters((f) => ({ ...f, shift: e.target.value }))}
            >
              <option value="">Всички смени</option>
              <option value="full">{SHIFT_LABELS.full}</option>
              <option value="evening">{SHIFT_LABELS.evening}</option>
            </select>
          </div>
        </details>
      ) : null}

      {loading ? (
        <Spinner label="Зареждане на графика…" />
      ) : error ? (
        <div className="banner banner--error" role="alert">
          {error}
          <button className="btn btn--sm btn--ghost" onClick={load}>
            Опитай отново
          </button>
        </div>
      ) : !data.configured ? (
        <div className="empty-state">
          Графикът не е конфигуриран. {isAdmin ? 'Задайте Google Sheet връзка по-горе.' : 'Свържете се с администратор.'}
        </div>
      ) : view === 'mine' ? (
        <div className="schedule-mine">
          {myByWeekday.map(([wd, { dateISO, list }]) => (
            <section key={wd} className="mine-day">
              <div className="mine-day__head">
                <span className="mine-day__weekday">{weekdayNameByIndex(wd)}</span>
                {dateISO ? <span className="mine-day__date">{formatDateBG(dateISO)}</span> : null}
              </div>
              <ul className="schedule-list">
                {list.map((e) => (
                  <li key={e.schedule_id} className={'schedule-item schedule-item--' + e.shift_type}>
                    <span className="schedule-item__person">{e.location_name}</span>
                    <span className="schedule-item__shift">{SHIFT_LABELS[e.shift_type]}</span>
                    <ScheduleCar rawCar={e.car} known={knownCars} />
                    {formatPayment(e.payment) ? (
                      <span className="schedule-item__pay">{formatPayment(e.payment)}</span>
                    ) : null}
                    <span className="schedule-item__hours">{shiftHours(e.shift_type)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : byWeekday.length === 0 ? (
        <div className="empty-state">Няма записи в графика за избраните филтри.</div>
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
                  ? locList.map(([locName, entries]) => {
                      const key = locKey(wd, locName)
                      // Open if the user expanded it, or a location filter is pinning it.
                      const locOpen = openLocs.has(key) || filters.location === locName
                      return (
                        <div
                          key={locName}
                          className={'schedule-loc' + (locOpen ? ' schedule-loc--open' : '')}
                        >
                          <button
                            type="button"
                            className="schedule-loc__head"
                            aria-expanded={locOpen}
                            onClick={() => toggleLoc(key)}
                          >
                            <span
                              className={
                                'schedule-loc__chevron' +
                                (locOpen ? ' schedule-loc__chevron--open' : '')
                              }
                              aria-hidden="true"
                            >
                              ▸
                            </span>
                            <span className="schedule-loc__name">{locName}</span>
                            <span className="schedule-loc__count">{entries.length}</span>
                          </button>
                          {locOpen ? (
                            <ul className="schedule-list">
                              {entries.map((e) => (
                                <li
                                  key={e.schedule_id}
                                  className={'schedule-item schedule-item--' + e.shift_type}
                                >
                                  <span className="schedule-item__person">{e.employee_name}</span>
                                  <span className="schedule-item__shift">{SHIFT_LABELS[e.shift_type]}</span>
                                  <ScheduleCar rawCar={e.car} known={knownCars} />
                                  {formatPayment(e.payment) ? (
                                    <span className="schedule-item__pay">{formatPayment(e.payment)}</span>
                                  ) : null}
                                  <span className="schedule-item__hours">{shiftHours(e.shift_type)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      )
                    })
                  : null}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
