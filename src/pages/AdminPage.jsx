import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import AdminDashboard from '../components/admin/AdminDashboard.jsx'
import AdminEmployees from '../components/admin/AdminEmployees.jsx'
import AdminVehicles from '../components/admin/AdminVehicles.jsx'
import AdminLocations from '../components/admin/AdminLocations.jsx'
import AdminPasswords from '../components/admin/AdminPasswords.jsx'
import AdminScheduleArchive from '../components/admin/AdminScheduleArchive.jsx'
import AdminDevNotes from '../components/admin/AdminDevNotes.jsx'

const BASE_TABS = [
  { key: 'dashboard', label: 'Табло', C: AdminDashboard },
  { key: 'employees', label: 'Служители', C: AdminEmployees },
  { key: 'passwords', label: 'Пароли', C: AdminPasswords },
  { key: 'vehicles', label: 'Автомобили', C: AdminVehicles },
  { key: 'locations', label: 'Локации', C: AdminLocations },
  { key: 'scheduleArchive', label: 'Архив', C: AdminScheduleArchive },
]
// Private dev changelog — only shown to ПАВЕЛ / В. ПЕТКОВ (backend also enforces this
// on every dev-notes route, so hiding the tab is a UX nicety, not the real gate).
const DEV_NOTES_TAB = { key: 'devNotes', label: 'Dev Notes', C: AdminDevNotes }

export default function AdminPage() {
  const { isAdmin, canViewDevNotes } = useAuth()
  const [tab, setTab] = useState('dashboard')

  if (!isAdmin) {
    return (
      <div className="page">
        <h1 className="page__title">Администрация</h1>
        <div className="empty-state">Нямате достъп до този раздел.</div>
      </div>
    )
  }

  const TABS = canViewDevNotes ? [...BASE_TABS, DEV_NOTES_TAB] : BASE_TABS
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
