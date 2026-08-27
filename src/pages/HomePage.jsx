import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { todayISO, weekdayIndex, shiftISO, weekdayBG, formatDateBG } from '../utils/datetime.js'
import SofiaMap from '../components/SofiaMap.jsx'
import LocationDetailPanel from '../components/LocationDetailPanel.jsx'
import Icon from '../components/Icon.jsx'
import Spinner from '../components/Spinner.jsx'

const norm = (s) => (s || '').toString().trim().toLowerCase()

export default function HomePage() {
  // Schedule + locations (and today's shift) come from Layout via Outlet context.
  const { locations, schedule, loading, error, reload, todayShift } = useOutletContext()
  const [date, setDate] = useState(todayISO())
  const [selectedId, setSelectedId] = useState(null)
  const [autoFocused, setAutoFocused] = useState(false)

  const isToday = date === todayISO()

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

  const unmappedNames = useMemo(() => {
    const present = new Set(locations.map((l) => norm(l.name)))
    return [...new Set(schedule.locationNames.filter((n) => !present.has(norm(n))))]
  }, [locations, schedule.locationNames])

  const selectedLocation = locations.find((l) => l.location_id === selectedId) || null

  // Focus the map on today's restaurant (if it has coordinates); else stay zoomed out.
  const focus =
    todayShift?.location && todayShift.location.latitude != null
      ? [Number(todayShift.location.latitude), Number(todayShift.location.longitude)]
      : null

  // On first load, also select today's restaurant so the side panel opens on it.
  useEffect(() => {
    if (!autoFocused && todayShift?.location) {
      setSelectedId(todayShift.location.location_id)
      setAutoFocused(true)
    }
  }, [autoFocused, todayShift])

  if (loading) {
    return (
      <div className="center-screen">
        <Spinner label="Зареждане на картата…" />
      </div>
    )
  }

  return (
    <div className="home">
      {error ? (
        <div className="banner banner--error" role="alert">
          {error}
          <button className="btn btn--sm btn--ghost" onClick={() => reload(true)}>
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
          <button
            className="map-nav map-nav--prev"
            onClick={() => setDate(shiftISO(date, -1))}
            aria-label="Предишен ден"
          >
            <Icon name="chevron-left" size={20} />
          </button>

          <div className="map-datechip">
            <span className="map-datechip__weekday">{weekdayBG(date)}</span>
            <span className="map-datechip__date">{formatDateBG(date)}</span>
            {!isToday ? (
              <button className="map-datechip__today" onClick={() => setDate(todayISO())}>
                Днес
              </button>
            ) : null}
          </div>

          <button
            className="map-nav map-nav--next"
            onClick={() => setDate(shiftISO(date, 1))}
            aria-label="Следващ ден"
          >
            <Icon name="chevron-right" size={20} />
          </button>

          <SofiaMap
            locations={locations}
            countsByLocation={countsByLocation}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focus={focus}
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
                <div className="empty-state empty-state--sm">Няма добавени работни локации.</div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
