import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getCar,
  takeCar,
  releaseCar,
  getCarUsageHistory,
  getCarMaintenance,
} from '../services/fleet/fleet.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { carTitle, SEVERITY } from '../utils/vehicles.js'
import { formatStampBG } from '../utils/datetime.js'
import StatusBadge from '../components/StatusBadge.jsx'
import ReleaseCarModal from '../components/ReleaseCarModal.jsx'
import UsageHistoryList from '../components/UsageHistoryList.jsx'
import Spinner from '../components/Spinner.jsx'

export default function VehicleDetailPage() {
  const { carId } = useParams()
  const { user, isAdmin } = useAuth()
  const { showToast } = useToast()

  const [car, setCar] = useState(null)
  const [issues, setIssues] = useState([])
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(false)
  const [showRelease, setShowRelease] = useState(false)

  const loadCar = useCallback(async () => {
    const [c, m] = await Promise.all([getCar(carId), getCarMaintenance(carId, 'open')])
    setCar(c)
    setIssues(m)
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

  async function onTake() {
    setActing(true)
    try {
      await takeCar(carId)
      showToast('Автомобилът е записан на ваше име.', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
      await refresh() // reflect the real current status after a failed race
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
      {issues.length > 0 ? (
        <section className="issues-box">
          <h2 className="issues-box__title">⚠ Активни проблеми</h2>
          {issues.map((it) => (
            <div key={it.maintenance_id} className="issue">
              <div className="issue__head">
                <span className="issue__name">{it.title}</span>
                <span className={'sev sev--' + (SEVERITY[it.severity]?.cls || 'muted')}>
                  {SEVERITY[it.severity]?.label || it.severity}
                </span>
              </div>
              {it.description ? <div className="issue__desc">{it.description}</div> : null}
              <div className="issue__meta">
                Докладвано от: {it.reported_by_name || '—'} · {formatStampBG(it.reported_at)}
              </div>
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

      {showRelease ? (
        <ReleaseCarModal
          onClose={() => setShowRelease(false)}
          onSubmit={onRelease}
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
