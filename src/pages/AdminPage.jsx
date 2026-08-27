import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import AdminDashboard from '../components/admin/AdminDashboard.jsx'
import AdminEmployees from '../components/admin/AdminEmployees.jsx'
import AdminVehicles from '../components/admin/AdminVehicles.jsx'
import AdminLocations from '../components/admin/AdminLocations.jsx'

const TABS = [
  { key: 'dashboard', label: 'Табло', C: AdminDashboard },
  { key: 'employees', label: 'Служители', C: AdminEmployees },
  { key: 'vehicles', label: 'Автомобили', C: AdminVehicles },
  { key: 'locations', label: 'Локации', C: AdminLocations },
]

export default function AdminPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('dashboard')

  if (!isAdmin) {
    return (
      <div className="page">
        <h1 className="page__title">Администрация</h1>
        <div className="empty-state">Нямате достъп до този раздел.</div>
      </div>
    )
  }

  const Active = TABS.find((t) => t.key === tab)?.C || AdminDashboard

  return (
    <div className="page">
      <h1 className="page__title">Администрация</h1>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={'tab' + (tab === t.key ? ' tab--active' : '')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        <Active />
      </div>

      <p className="admin-links">
        Източник на графика се управлява в <Link to="/schedule">График</Link>; настройките за
        наличност — в <Link to="/availability">Следваща седмица</Link>.
      </p>
    </div>
  )
}
