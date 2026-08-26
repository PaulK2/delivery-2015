import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { CONFIG } from '../config/index.js'
import { NAV_ITEMS } from './nav.js'
import OfflineBanner from './OfflineBanner.jsx'

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">🚚</span>
          <span className="app-header__title">{CONFIG.appName}</span>
        </div>
        <div className="app-header__user">
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
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="app-main">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="bottom-nav" aria-label="Основна навигация">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              'bottom-nav__link' + (isActive ? ' bottom-nav__link--active' : '')
            }
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="bottom-nav__label">{item.short || item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
