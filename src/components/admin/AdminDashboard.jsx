import { useEffect, useState } from 'react'
import { getCars } from '../../services/fleet/fleet.js'
import { getMaintenance } from '../../services/maintenance/maintenance.js'
import { getAllDocuments } from '../../services/documents/documents.js'
import { getEmployees } from '../../services/employees/employees.js'
import { getAvailabilityStatus, getAvailability } from '../../services/availability/availability.js'
import { computeDocStatus } from '../../utils/documents.js'
import { formatDateBG } from '../../utils/datetime.js'
import UpcomingDeadlines from '../UpcomingDeadlines.jsx'
import Spinner from '../Spinner.jsx'

export default function AdminDashboard() {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const status = await getAvailabilityStatus()
        const [cars, maint, docs, emps, avail] = await Promise.all([
          getCars(),
          getMaintenance({}),
          getAllDocuments(),
          getEmployees(),
          getAvailability(status.weekStart),
        ])
        if (!alive) return
        const openIssues = maint.filter((m) => m.status === 'open')
        const submitted = new Set(avail.map((a) => a.employee_id))
        const activeEmps = emps.filter((e) => e.active)
        setD({
          free: cars.filter((c) => c.status === 'available').length,
          inUse: cars.filter((c) => c.status === 'in_use').length,
          maint: cars.filter((c) => c.status === 'maintenance').length,
          total: cars.length,
          issues: openIssues.length,
          critical: openIssues.filter((m) => m.severity === 'critical').length,
          expiring: docs.filter((doc) => ['soon', 'expired'].includes(computeDocStatus(doc.valid_until, doc.warning_days).state)).length,
          weekStart: status.weekStart,
          open: status.open,
          submitted: submitted.size,
          notSubmitted: activeEmps.filter((e) => !submitted.has(e.employee_id)).length,
        })
      } catch (e) {
        if (alive) setError(e.message || 'Грешка при зареждане.')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (error) return <div className="banner banner--error">{error}</div>
  if (!d) return <Spinner label="Зареждане…" />

  return (
    <div>
      <div className="stat-grid">
        <Stat label="Свободни" value={d.free} tone="ok" />
        <Stat label="В движение" value={d.inUse} tone="accent" />
        <Stat label="Недостъпни" value={d.maint} tone={d.maint ? 'danger' : 'muted'} />
        <Stat label="Общо активни" value={d.total} tone="muted" />
        <Stat label="Активни сигнали" value={d.issues} tone={d.issues ? 'warn' : 'muted'} />
        <Stat label="Критични" value={d.critical} tone={d.critical ? 'danger' : 'muted'} />
        <Stat label="Изтичащи документи" value={d.expiring} tone={d.expiring ? 'warn' : 'muted'} />
        <Stat label="Неподали наличност" value={d.notSubmitted} tone={d.notSubmitted ? 'warn' : 'muted'} />
      </div>

      <div className="availability-note">
        Наличност за седмица {formatDateBG(d.weekStart)} —{' '}
        {d.open ? 'приемът е отворен' : 'приемът е затворен'} · подали: {d.submitted}
      </div>

      <UpcomingDeadlines />
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className={'stat stat--' + tone}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  )
}
