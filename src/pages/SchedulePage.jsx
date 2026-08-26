import { useEffect, useMemo, useState } from 'react'
import { getSchedule, refreshSchedule } from '../services/schedule/schedule.js'
import { formatDateBG, weekdayBG } from '../utils/datetime.js'
import { shiftHours, shiftSortRank, SHIFT_LABELS } from '../utils/shifts.js'
import { useAuth } from '../context/AuthContext.jsx'
import Spinner from '../components/Spinner.jsx'
import ScheduleSourceConfig from '../components/ScheduleSourceConfig.jsx'

const uniqSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bg'))

export default function SchedulePage() {
  const { isAdmin } = useAuth()
  const [schedule, setSchedule] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ employee: '', location: '', shift: '' })

  async function load(refresh = false) {
    setLoading(true)
    setError('')
    try {
      const data = refresh ? await refreshSchedule() : await getSchedule()
      setSchedule(data)
    } catch (e) {
      setError(e.message || 'Графикът не може да бъде зареден.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(false)
  }, [])

  const employees = useMemo(() => uniqSorted(schedule.map((e) => e.employee_name)), [schedule])
  const locations = useMemo(() => uniqSorted(schedule.map((e) => e.location_name)), [schedule])

  const filtered = useMemo(() => {
    return schedule.filter((e) => {
      if (filters.employee && e.employee_name !== filters.employee) return false
      if (filters.location && e.location_name !== filters.location) return false
      if (filters.shift && e.shift_type !== filters.shift) return false
      return true
    })
  }, [schedule, filters])

  // Group by date (spec §15 — "by day" view).
  const byDay = useMemo(() => {
    const map = new Map()
    for (const e of filtered) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date).push(e)
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          shiftSortRank(a.shift_type) - shiftSortRank(b.shift_type) ||
          a.location_name.localeCompare(b.location_name, 'bg')
      )
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">График</h1>
        <button className="btn btn--ghost btn--sm" onClick={() => load(true)}>
          ↻ Обнови
        </button>
      </div>

      {isAdmin ? <ScheduleSourceConfig onLoaded={() => load(true)} /> : null}

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
          <button className="btn btn--sm btn--ghost" onClick={() => load(true)}>
            Опитай отново
          </button>
        </div>
      ) : byDay.length === 0 ? (
        <div className="empty-state">Няма записи в графика за избраните филтри.</div>
      ) : (
        <div className="schedule-days">
          {byDay.map(([date, entries]) => (
            <section key={date} className="schedule-day">
              <h2 className="schedule-day__head">
                <span className="schedule-day__weekday">{weekdayBG(date)}</span>
                <span className="schedule-day__date">{formatDateBG(date)}</span>
                <span className="schedule-day__count">{entries.length}</span>
              </h2>
              <ul className="schedule-list">
                {entries.map((e) => (
                  <li
                    key={e.schedule_id}
                    className={'schedule-item schedule-item--' + e.shift_type}
                  >
                    <span className="schedule-item__person">{e.employee_name || '—'}</span>
                    <span className="schedule-item__location">{e.location_name || '—'}</span>
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
