import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { CONFIG } from '../config/index.js'
import { getLocations, getSchedule } from '../services/schedule/schedule.js'
import { useAutoRefresh } from '../hooks/useAutoRefresh.js'
import { todayISO, weekdayIndex, weekdayBG, formatDateBG } from '../utils/datetime.js'
import { NAV_ITEMS, MORE_ITEM } from './nav.js'
import OfflineBanner from './OfflineBanner.jsx'
import ConnectionBanner from './ConnectionBanner.jsx'
import GlobalSearch from './GlobalSearch.jsx'
import Icon from './Icon.jsx'

// Case- and space-insensitive name key (so "Иван  Петров" == "иванпетров").
const nameKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')
const norm = (s) => (s || '').toString().trim().toLowerCase()

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin)
  // Bottom bar (mobile) stays short: the everyday screens + an "Още" button for the rest.
  // The desktop side nav has room, so it lists every destination directly.
  const primaryItems = items.filter((i) => i.group === 'primary')

  // The main (map) page shows the day/date on the map itself, so we hide the top-bar
  // date there to avoid displaying it twice; every other page shows it in the top bar.
  const isHome = useLocation().pathname === '/'

  // Schedule + locations are loaded once here (Layout stays mounted across routes)
  // and shared with pages via Outlet context, so the top bar and the Home map use
  // the same data without fetching twice.
  const [locations, setLocations] = useState([])
  const [schedule, setSchedule] = useState({ entries: [], locationNames: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Guard so scheduled/focus refreshes can't overlap: if a load is still in flight,
  // a new background trigger is skipped instead of firing a duplicate request.
  const inFlight = useRef(false)

  // `force` bypasses the client cache (background revalidation); the initial load reuses
  // any warm cache so returning to Home feels instant.
  const reload = useCallback(async (showSpinner = false, force = false) => {
    if (inFlight.current) return
    inFlight.current = true
    if (showSpinner) setLoading(true)
    try {
      const [locRes, schRes] = await Promise.allSettled([
        getLocations({ force }),
        getSchedule({ force }),
      ])
      if (locRes.status === 'fulfilled') setLocations(locRes.value)
      if (schRes.status === 'fulfilled') {
        setSchedule(schRes.value)
        setError('')
      } else {
        setError(schRes.reason?.message || 'Данните не могат да бъдат заредени.')
      }
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload(true, false)
  }, [reload])

  useAutoRefresh(() => reload(false, true), CONFIG.autoRefreshMs)

  const todayIso = todayISO()
  const todayWd = weekdayIndex(todayIso)

  // The logged-in user's shift for TODAY (name matched space/case-insensitively).
  const todayShift = useMemo(() => {
    if (!user) return null
    const key = nameKey(user.name)
    const mine = (schedule.entries || []).find(
      (e) => e.weekday === todayWd && nameKey(e.employee_name) === key
    )
    if (!mine) return null
    const location = (locations || []).find((l) => norm(l.name) === norm(mine.location_name)) || null
    return { entry: mine, location }
  }, [schedule, locations, user, todayWd])

  const outletContext = { locations, schedule, loading, error, reload, todayShift }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">
            <Icon name="car" size={24} />
          </span>
          <span className="app-header__title">{CONFIG.appName}</span>
        </div>

        <div className="app-header__shift" aria-label="Смяна за днес">
          {!isHome ? (
            <span className="app-header__shift-date">
              {weekdayBG(todayIso)}, {formatDateBG(todayIso)}
            </span>
          ) : null}
          <span
            className={
              'app-header__shift-work' + (todayShift ? '' : ' app-header__shift-work--off')
            }
          >
            {todayShift ? `📍 ${todayShift.entry.location_name}` : 'Няма смяна днес'}
          </span>
        </div>

        <div className="app-header__user">
          <GlobalSearch />
          {user ? (
            <>
              <span className="app-header__name">{user.name}</span>
              <button className="btn btn--ghost btn--sm" onClick={logout}>
                Изход
              </button>
            </>
          ) : null}
        </div>
      </header>

      <OfflineBanner />
      <ConnectionBanner />

      <div className="app-body">
        {/* Desktop side navigation */}
        <nav className="side-nav" aria-label="Основна навигация">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                'side-nav__link' + (isActive ? ' side-nav__link--active' : '')
              }
            >
              <span className="side-nav__icon" aria-hidden="true">
                <Icon name={item.icon} size={19} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <main className={'app-main' + (isHome ? ' app-main--home' : '')}>
          <Outlet context={outletContext} />
        </main>
      </div>

      {/* Mobile bottom navigation — everyday screens + an "Още" button for the rest */}
      <nav className="bottom-nav" aria-label="Основна навигация">
        {[...primaryItems, MORE_ITEM].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              'bottom-nav__link' + (isActive ? ' bottom-nav__link--active' : '')
            }
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              <Icon name={item.icon} size={22} />
            </span>
            <span className="bottom-nav__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
