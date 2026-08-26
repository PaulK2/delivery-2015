import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getCar,
  takeCar,
  releaseCar,
  getCarUsageHistory,
  getCarMaintenance,
  restoreCarToService,
} from '../services/fleet/fleet.js'
import { reportIssue, resolveIssue } from '../services/maintenance/maintenance.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { carTitle, SEVERITY, severityRank, categoryLabel } from '../utils/vehicles.js'
import { formatMoney } from '../utils/shifts.js'
import { formatStampBG } from '../utils/datetime.js'
import StatusBadge from '../components/StatusBadge.jsx'
import ReleaseCarModal from '../components/ReleaseCarModal.jsx'
import ReportIssueModal from '../components/ReportIssueModal.jsx'
import ResolveIssueModal from '../components/ResolveIssueModal.jsx'
import UsageHistoryList from '../components/UsageHistoryList.jsx'
import Spinner from '../components/Spinner.jsx'

export default function VehicleDetailPage() {
  const { carId } = useParams()
  const { user, isAdmin } = useAuth()
  const { showToast } = useToast()

  const [car, setCar] = useState(null)
  const [maintenance, setMaintenance] = useState([])
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(false)
  const [showRelease, setShowRelease] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [resolving, setResolving] = useState(null) // issue being resolved, or null

  const loadCar = useCallback(async () => {
    const [c, m] = await Promise.all([getCar(carId), getCarMaintenance(carId)])
    setCar(c)
    setMaintenance(m)
    return c
  }, [carId])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    Promise.all([loadCar(), getCarUsageHistory(carId)])
      .then(([, h]) => {
        if (alive) setHistory(h)
      })
      .catch((e) => alive && setError(e.message || 'Автомобилът не може да бъде зареден.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [carId, loadCar])

  async function refresh() {
    try {
      await loadCar()
      setHistory(await getCarUsageHistory(carId))
    } catch {
      /* keep previous view on transient refresh errors */
    }
  }

  const openIssues = useMemo(
    () =>
      maintenance
        .filter((m) => m.status === 'open')
        .sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    [maintenance]
  )
  const repairs = useMemo(
    () =>
      maintenance
        .filter((m) => m.status === 'resolved')
        .sort((a, b) => String(b.resolved_at).localeCompare(String(a.resolved_at))),
    [maintenance]
  )

  async function onTake() {
    setActing(true)
    try {
      await takeCar(carId)
      showToast('Автомобилът е записан на ваше име.', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
      await refresh()
    } finally {
      setActing(false)
    }
  }

  async function onRelease(parkedLocation, notes) {
    setActing(true)
    try {
      await releaseCar(carId, parkedLocation, notes)
      setShowRelease(false)
      showToast('Автомобилът е освободен.', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setActing(false)
    }
  }

  async function onReport(issue) {
    setActing(true)
    try {
      await reportIssue({ carId, ...issue })
      setShowReport(false)
      showToast(
        issue.severity === 'critical'
          ? 'Проблемът е докладван. Автомобилът е маркиран като недостъпен.'
          : 'Проблемът е докладван.',
        'success'
      )
      await refresh()
    } catch (e) {
      showToast(e.message || 'Възникна проблем при докладването.', 'error')
    } finally {
      setActing(false)
    }
  }

  async function onResolve(payload) {
    setActing(true)
    try {
      await resolveIssue(payload)
      setResolving(null)
      showToast('Проблемът е отстранен.', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setActing(false)
    }
  }

  async function onRestore() {
    setActing(true)
    try {
      await restoreCarToService(car)
      showToast('Автомобилът е върнат в експлоатация.', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return (
      <div className="center-screen">
        <Spinner label="Зареждане…" />
      </div>
    )
  }

  if (error || !car) {
    return (
      <div className="page">
        <BackLink />
        <div className="banner banner--error" role="alert">
          {error || 'Записът не е намерен.'}
        </div>
      </div>
    )
  }

  const isDriver = car.current_driver_id && car.current_driver_id === user?.employee_id
  const canTake = car.status === 'available' && car.active
  const canRelease = car.status === 'in_use' && (isDriver || isAdmin)

  return (
    <div className="page vehicle-detail">
      <BackLink />

      <div className="vehicle-hero">
        <div className="vehicle-hero__media">
          {car.image ? (
            <img src={car.image} alt={carTitle(car)} />
          ) : (
            <span className="vehicle-hero__noimg" aria-hidden="true">🚗</span>
          )}
        </div>
        <div className="vehicle-hero__info">
          <div className="vehicle-hero__plate">{car.registration}</div>
          <div className="vehicle-hero__name">{carTitle(car)}</div>
          {car.year ? <div className="vehicle-hero__year">{car.year}</div> : null}
          <div className="vehicle-hero__status">
            <StatusBadge status={car.status} />
          </div>
          {car.status === 'in_use' && car.current_driver_name ? (
            <div className="vehicle-hero__meta">👤 {car.current_driver_name}</div>
          ) : car.status === 'available' && car.parked_location ? (
            <div className="vehicle-hero__meta">📍 Паркиран: {car.parked_location}</div>
          ) : null}
        </div>
      </div>

      {/* Active issues — prominent (spec §41) */}
      {openIssues.length > 0 ? (
        <section className="issues-box">
          <h2 className="issues-box__title">⚠ Активни проблеми</h2>
          {openIssues.map((it) => (
            <div key={it.maintenance_id} className="issue">
              <div className="issue__head">
                <span className="issue__name">{it.title}</span>
                <span className={'sev sev--' + (SEVERITY[it.severity]?.cls || 'muted')}>
                  {SEVERITY[it.severity]?.label || it.severity}
                </span>
              </div>
              {it.description ? <div className="issue__desc">{it.description}</div> : null}
              <div className="issue__meta">
                {categoryLabel(it.category)} · Докладвано от: {it.reported_by_name || '—'} ·{' '}
                {formatStampBG(it.reported_at)}
              </div>
              {isAdmin ? (
                <button
                  className="btn btn--ghost btn--sm issue__resolve"
                  onClick={() => setResolving(it)}
                  disabled={acting}
                >
                  Маркирай като отстранен
                </button>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {/* Actions */}
      <div className="vehicle-actions">
        {canTake ? (
          <button className="btn btn--primary btn--block" onClick={onTake} disabled={acting}>
            {acting ? 'Обработва се…' : 'Вземи автомобила'}
          </button>
        ) : null}
        {canRelease ? (
          <button
            className="btn btn--primary btn--block"
            onClick={() => setShowRelease(true)}
            disabled={acting}
          >
            Освободи автомобила
          </button>
        ) : null}
        {car.status === 'in_use' && !canRelease ? (
          <div className="banner banner--warn">
            Автомобилът се управлява от {car.current_driver_name || 'друг служител'}.
          </div>
        ) : null}
        {car.status === 'maintenance' ? (
          <div className="banner banner--error">
            Автомобилът е недостъпен{car.notes ? `: ${car.notes}` : ''}.
          </div>
        ) : null}
        {isAdmin && car.status === 'maintenance' ? (
          <button className="btn btn--ghost btn--block" onClick={onRestore} disabled={acting}>
            Върни в експлоатация
          </button>
        ) : null}

        <button
          className="btn btn--ghost btn--block"
          onClick={() => setShowReport(true)}
          disabled={acting}
        >
          Докладвай проблем
        </button>
      </div>

      {/* Usage history */}
      <section className="detail-section">
        <h2 className="detail-section__title">История на ползване</h2>
        {history === null ? (
          <Spinner label="Зареждане на историята…" />
        ) : (
          <UsageHistoryList history={history} />
        )}
      </section>

      {/* Repair history (spec §44) */}
      <section className="detail-section">
        <h2 className="detail-section__title">История на ремонти</h2>
        {repairs.length === 0 ? (
          <div className="empty-state empty-state--sm">Няма извършени ремонти.</div>
        ) : (
          <ul className="repair-list">
            {repairs.map((r) => (
              <li key={r.maintenance_id} className="repair-item">
                <div className="repair-item__head">
                  <span className="repair-item__title">{r.title}</span>
                  <span className="repair-item__date">{formatStampBG(r.resolved_at).split(' ')[0]}</span>
                </div>
                <div className="repair-item__cat">
                  {categoryLabel(r.category)} · докладвано {formatStampBG(r.reported_at).split(' ')[0]} от{' '}
                  {r.reported_by_name || '—'}
                </div>
                {r.repair_description ? (
                  <div className="repair-item__desc">{r.repair_description}</div>
                ) : null}
                <div className="repair-item__meta">
                  {r.service ? <span>🔧 {r.service}</span> : null}
                  {r.cost ? <span>💰 {formatMoney(r.cost)}</span> : null}
                  {r.resolved_by_name ? <span>✔ {r.resolved_by_name}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showRelease ? (
        <ReleaseCarModal onClose={() => setShowRelease(false)} onSubmit={onRelease} submitting={acting} />
      ) : null}
      {showReport ? (
        <ReportIssueModal onClose={() => setShowReport(false)} onSubmit={onReport} submitting={acting} />
      ) : null}
      {resolving ? (
        <ResolveIssueModal
          issue={resolving}
          onClose={() => setResolving(null)}
          onSubmit={onResolve}
          submitting={acting}
        />
      ) : null}
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/vehicles" className="back-link">
      ‹ Автомобили
    </Link>
  )
}
