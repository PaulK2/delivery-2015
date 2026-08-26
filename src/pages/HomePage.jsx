import { useEffect, useMemo, useState } from 'react'
import { getLocations, getSchedule } from '../services/schedule/schedule.js'
import { todayISO, weekdayIndex } from '../utils/datetime.js'
import { CONFIG } from '../config/index.js'
import DateNav from '../components/DateNav.jsx'
import SofiaMap from '../components/SofiaMap.jsx'
import LocationDetailPanel from '../components/LocationDetailPanel.jsx'
import Spinner from '../components/Spinner.jsx'

const norm = (s) => (s || '').toString().trim().toLowerCase()

export default function HomePage() {
  const [date, setDate] = useState(todayISO())
  const [locations, setLocations] = useState([])
  const [schedule, setSchedule] = useState({ entries: [], locationNames: [] })
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true)
    setError('')
    try {
      const [locs, sched] = await Promise.all([getLocations(), getSchedule()])
      setLocations(locs)
      setSchedule(sched)
    } catch (e) {
      setError(e.message || 'Данните не могат да бъдат заредени.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(true)
    // Auto-refresh operational data (spec §80).
    const id = setInterval(() => load(false), CONFIG.autoRefreshMs)
    const onFocus = () => load(false)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const locByName = useMemo(() => {
    const m = new Map()
    locations.forEach((l) => m.set(norm(l.name), l.location_id))
    return m
  }, [locations])

  // Schedule entries are keyed by weekday; match the selected date's weekday.
  const wd = weekdayIndex(date)
  const entriesForDate = useMemo(
    () => schedule.entries.filter((e) => e.weekday === wd),
    [schedule, wd]
  )

  const entriesByLocation = useMemo(() => {
    const map = {}
    for (const e of entriesForDate) {
      const locId = locByName.get(norm(e.location_name))
      if (!locId) continue
      ;(map[locId] ||= []).push(e)
    }
    return map
  }, [entriesForDate, locByName])

  const countsByLocation = useMemo(() => {
    const c = {}
    for (const [id, list] of Object.entries(entriesByLocation)) c[id] = list.length
    return c
  }, [entriesByLocation])

  // Location names present in the schedule but missing from the Locations tab
  // (so they can't be placed on the map yet).
  const unmappedNames = useMemo(() => {
    const present = new Set(locations.map((l) => norm(l.name)))
    return [...new Set(schedule.locationNames.filter((n) => !present.has(norm(n))))]
  }, [locations, schedule.locationNames])

  const selectedLocation = locations.find((l) => l.location_id === selectedId) || null

  if (loading) {
    return (
      <div className="center-screen">
        <Spinner label="Зареждане на картата…" />
      </div>
    )
  }

  return (
    <div className="home">
      <div className="home__toolbar">
        <DateNav date={date} onChange={setDate} />
      </div>

      {error ? (
        <div className="banner banner--error" role="alert">
          {error}
          <button className="btn btn--sm btn--ghost" onClick={() => load(true)}>
            Опитай отново
          </button>
        </div>
      ) : null}

      {locations.length === 0 && unmappedNames.length > 0 ? (
        <div className="banner banner--warn">
          Локациите от графика още нямат координати: {unmappedNames.join(', ')}. Добавете ги в
          Администрация, за да се покажат на картата.
        </div>
      ) : null}

      <div className="home__layout">
        <div className="home__map">
          <SofiaMap
            locations={locations}
            countsByLocation={countsByLocation}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <div className="home__side">
          {selectedLocation ? (
            <LocationDetailPanel
              location={selectedLocation}
              entries={entriesByLocation[selectedLocation.location_id] || []}
              date={date}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="location-panel location-panel--hint">
              <p className="location-panel__hint">
                Изберете локация от картата, за да видите кой работи там.
              </p>
              {locations.length === 0 ? (
                <div className="empty-state empty-state--sm">
                  Няма добавени работни локации.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
