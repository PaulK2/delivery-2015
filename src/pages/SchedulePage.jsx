import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSchedule } from '../services/schedule/schedule.js'
import { getCars } from '../services/fleet/fleet.js'
import { weekdayNameByIndex, WEEK_ORDER } from '../utils/datetime.js'
import { shiftHours, shiftSortRank, formatPayment, SHIFT_LABELS } from '../utils/shifts.js'
import { normalizePlate, resolveScheduleCar } from '../utils/vehicles.js'
import { useAuth } from '../context/AuthContext.jsx'
import Spinner from '../components/Spinner.jsx'
import ScheduleSourceConfig from '../components/ScheduleSourceConfig.jsx'

const uniqSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bg'))

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
  const { isAdmin } = useAuth()
  const [data, setData] = useState({ entries: [], locationNames: [], configured: true, sheetName: '' })
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ employee: '', location: '', shift: '' })

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

  const filtered = useMemo(() => {
    return data.entries.filter((e) => {
      if (filters.employee && e.employee_name !== filters.employee) return false
      if (filters.location && e.location_name !== filters.location) return false
      if (filters.shift && e.shift_type !== filters.shift) return false
      return true
    })
  }, [data, filters])

  // Group by weekday, Monday-first (spec §15 — "by day" view).
  const byWeekday = useMemo(() => {
    const map = new Map()
    for (const e of filtered) {
      if (!map.has(e.weekday)) map.set(e.weekday, [])
      map.get(e.weekday).push(e)
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          shiftSortRank(a.shift_type) - shiftSortRank(b.shift_type) ||
          a.location_name.localeCompare(b.location_name, 'bg')
      )
    }
    return WEEK_ORDER.filter((wd) => map.has(wd)).map((wd) => [wd, map.get(wd)])
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
      ) : byWeekday.length === 0 ? (
        <div className="empty-state">Няма записи в графика за избраните филтри.</div>
      ) : (
        <div className="schedule-days">
          {byWeekday.map(([wd, entries]) => (
            <section key={wd} className="schedule-day">
              <h2 className="schedule-day__head">
                <span className="schedule-day__weekday">{weekdayNameByIndex(wd)}</span>
                <span className="schedule-day__count">{entries.length}</span>
              </h2>
              <ul className="schedule-list">
                {entries.map((e) => (
                  <li
                    key={e.schedule_id}
                    className={'schedule-item schedule-item--' + e.shift_type}
                  >
                    <span className="schedule-item__person">{e.employee_name}</span>
                    <span className="schedule-item__location">{e.location_name}</span>
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
      )}
    </div>
  )
}
