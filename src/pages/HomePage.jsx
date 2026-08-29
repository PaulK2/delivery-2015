import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { todayISO, shiftISO, weekdayBG, formatDateBG, scheduleEntriesForDate } from '../utils/datetime.js'
import { SHIFT_LABELS, shiftHours } from '../utils/shifts.js'
import { hasSeenIntro, markIntroSeen } from '../utils/uiPrefs.js'
import { getCars } from '../services/fleet/fleet.js'
import { useAutoRefresh } from '../hooks/useAutoRefresh.js'
import { CONFIG } from '../config/index.js'
import LocationDetailPanel from '../components/LocationDetailPanel.jsx'
import Modal from '../components/Modal.jsx'
import Icon from '../components/Icon.jsx'
import Spinner from '../components/Spinner.jsx'

// The map (Leaflet, ~150KB) is split out so the Home page frame — date nav, side panel,
// today's shift — paints immediately and the map streams in after.
const SofiaMap = lazy(() => import('../components/SofiaMap.jsx'))

const norm = (s) => (s || '').toString().trim().toLowerCase()
// Case- and space-insensitive name key (so "Иван  Петров" == "иванпетров").
const nameKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')

export default function HomePage() {
  // Schedule + locations come from Layout via Outlet context.
  const { locations, schedule, loading, error, reload } = useOutletContext()
  const { user } = useAuth()
  const [date, setDate] = useState(todayISO())
  const [selectedId, setSelectedId] = useState(null)
  const [showIntro, setShowIntro] = useState(() => !hasSeenIntro())

  // The map's "Коли" panel shows plates from the app's own Cars database (never the
  // schedule sheet's free-text notes), so the fleet list is loaded here too.
  const [cars, setCars] = useState([])
  useEffect(() => {
    let alive = true
    getCars()
      .then((list) => alive && setCars(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  useAutoRefresh(() => getCars({ force: true }).then((list) => setCars(list)).catch(() => {}), CONFIG.autoRefreshMs)

  function dismissIntro() {
    markIntroSeen()
    setShowIntro(false)
  }

  const isToday = date === todayISO()

  const locByName = useMemo(() => {
    const m = new Map()
    locations.forEach((l) => m.set(norm(l.name), l.location_id))
    return m
  }, [locations])

  // Match the selected calendar date exactly (day-of-month + weekday), so a week the
  // sheet doesn't cover shows an empty schedule instead of repeating this week's.
  const entriesForDate = useMemo(
    () => scheduleEntriesForDate(schedule.entries, date),
    [schedule, date]
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

  // The logged-in user's schedule entry for the currently VIEWED date (not just today).
  const myShiftEntry = useMemo(() => {
    if (!user) return null
    const key = nameKey(user.name)
    return entriesForDate.find((e) => nameKey(e.employee_name) === key) || null
  }, [entriesForDate, user])

  // …and the matching restaurant on the map.
  const myShiftLocation = useMemo(() => {
    if (!myShiftEntry) return null
    return locations.find((l) => norm(l.name) === norm(myShiftEntry.location_name)) || null
  }, [myShiftEntry, locations])

  const isTodayView = date === todayISO()

  // As the user cycles through days, follow their restaurant for that day: select it so
  // the panel below the map shows that day's schedule for it (not only the map zoom).
  // A manual marker click still overrides within the same day (this only re-runs when
  // the date or the day's shift location changes). Days with no shift clear the panel.
  const myShiftLocationId = myShiftLocation?.location_id || null
  useEffect(() => {
    setSelectedId(myShiftLocationId)
  }, [date, myShiftLocationId])

  if (loading) {
    return (
      <div className="center-screen">
        <Spinner label="Зареждане на картата…" />
      </div>
    )
  }

  return (
    <div className="home">
      {/* Plain-language answer to "where do I work and with what car" for the viewed day. */}
      <div className={'today-card' + (myShiftEntry ? '' : ' today-card--off')}>
        <div className="today-card__label">
          {isTodayView ? 'Днес' : weekdayBG(date)} · {formatDateBG(date)}
        </div>
        {myShiftEntry ? (
          <>
            <div className="today-card__main">
              <span className="today-card__loc">📍 {myShiftEntry.location_name}</span>
              <span className="today-card__shift">
                {SHIFT_LABELS[myShiftEntry.shift_type] || ''}
                {shiftHours(myShiftEntry.shift_type) ? ` · ${shiftHours(myShiftEntry.shift_type)}` : ''}
              </span>
            </div>
            {myShiftEntry.car ? (
              <div className="today-card__car">🚗 Кола: {myShiftEntry.car}</div>
            ) : null}
            <div className="today-card__actions">
              <Link to="/schedule" className="btn btn--ghost btn--sm">Виж графика</Link>
              <Link to="/day" className="btn btn--primary btn--sm">Моят ден</Link>
            </div>
          </>
        ) : (
          <div className="today-card__none">
            <span>{isTodayView ? 'Днес нямате смяна.' : 'Нямате смяна за този ден.'}</span>
            <Link to="/schedule" className="btn btn--ghost btn--sm">Виж графика</Link>
          </div>
        )}
      </div>

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

          <Suspense fallback={<div className="map-skeleton" aria-hidden="true" />}>
            <SofiaMap
              locations={locations}
              countsByLocation={countsByLocation}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Suspense>
        </div>

        <div className="home__side">
          {selectedLocation ? (
            <LocationDetailPanel
              location={selectedLocation}
              entries={entriesByLocation[selectedLocation.location_id] || []}
              date={date}
              cars={cars}
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

      {showIntro
        ? // Portalled to <body> so the modal is viewport-centred, not affected by the
          // page-entrance transform on `.home` (which otherwise offsets fixed children).
          createPortal(
            <Modal
              title="Добре дошли 👋"
              onClose={dismissIntro}
              footer={
                <button className="btn btn--primary btn--block" onClick={dismissIntro}>
                  Разбрах
                </button>
              }
            >
              <p className="intro-lead">Приложението има 3 основни стъпки:</p>
              <ol className="help-steps">
                <li><strong>Начало</strong> — вижте къде работите днес и с коя кола.</li>
                <li><strong>Автомобили</strong> — вземете колата в началото и я освободете накрая.</li>
                <li><strong>Моят ден</strong> — въведете доставките си след смяната.</li>
              </ol>
              <p className="intro-lead">
                Останалото е в бутона <strong>Още</strong> долу. Там може да включите и{' '}
                <strong>Голям текст</strong>.
              </p>
            </Modal>,
            document.body
          )
        : null}
    </div>
  )
}
