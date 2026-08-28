import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getCar,
  getCars,
  takeCar,
  releaseCar,
  getCarUsageHistory,
  getCarMaintenance,
  restoreCarToService,
  recordOilChange,
} from '../services/fleet/fleet.js'
import { reportIssue, resolveIssue } from '../services/maintenance/maintenance.js'
import { getVehicleDocuments, saveVehicleDocument } from '../services/documents/documents.js'
import { addFuelExpense, getFuelExpensesForUsage } from '../services/fuel/fuel.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { carTitle, carPhoto, isOwnCar, oilInfo, SEVERITY, severityRank, categoryLabel } from '../utils/vehicles.js'
import { formatMoney, formatEuro } from '../utils/shifts.js'
import { CONFIG } from '../config/index.js'
import { formatStampBG, formatDateBG } from '../utils/datetime.js'
import StatusBadge from '../components/StatusBadge.jsx'
import ReleaseCarModal from '../components/ReleaseCarModal.jsx'
import OilChangeModal from '../components/OilChangeModal.jsx'
import ReportIssueModal from '../components/ReportIssueModal.jsx'
import ResolveIssueModal from '../components/ResolveIssueModal.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import TakeCarModal from '../components/TakeCarModal.jsx'
import FuelExpenseModal from '../components/FuelExpenseModal.jsx'
import UsageHistoryList from '../components/UsageHistoryList.jsx'
import DocumentsSection from '../components/DocumentsSection.jsx'
import DocumentModal from '../components/DocumentModal.jsx'
import Spinner from '../components/Spinner.jsx'

export default function VehicleDetailPage() {
  const { carId } = useParams()
  const { user, isAdmin } = useAuth()
  const { showToast } = useToast()

  const [car, setCar] = useState(null)
  const [maintenance, setMaintenance] = useState([])
  const [documents, setDocuments] = useState([])
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(false)
  const [showRelease, setShowRelease] = useState(false)
  const [showOil, setShowOil] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [resolving, setResolving] = useState(null) // issue being resolved, or null
  const [docModal, setDocModal] = useState(null) // { doc } to edit/add, or null closed
  const [confirmTake, setConfirmTake] = useState(null) // { plate } when taking a 2nd car
  const [showTake, setShowTake] = useState(false) // fuel-money + equipment take modal
  const [showFuel, setShowFuel] = useState(false) // fuel-expense modal
  const [fuelEntries, setFuelEntries] = useState([]) // fuel expenses for current usage

  const loadCar = useCallback(async () => {
    const [c, m, d] = await Promise.all([
      getCar(carId),
      getCarMaintenance(carId),
      getVehicleDocuments(carId),
    ])
    setCar(c)
    setMaintenance(m)
    setDocuments(d)
    // Fuel expenses for the active usage session (for the balance + list).
    if (c && c.status === 'in_use' && c.current_usage_id) {
      try {
        setFuelEntries(await getFuelExpensesForUsage(c.current_usage_id, { force: true }))
      } catch {
        setFuelEntries([])
      }
    } else {
      setFuelEntries([])
    }
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

  // Taking a car: a driver may hold at most 2 at once, and taking a 2nd requires
  // confirmation (max 2 cars). Check what the user already drives, then either block
  // (already at 2), ask to confirm (has 1), or go straight to the take modal (has none).
  // The take modal collects fuel money + safety-equipment before the actual take.
  async function onTake() {
    setActing(true)
    try {
      const all = await getCars({ force: true })
      const mine = all.filter(
        (c) =>
          c.status === 'in_use' &&
          c.current_driver_id &&
          String(c.current_driver_id) === String(user?.employee_id)
      )
      if (mine.length >= 2) {
        showToast(
          'Достигнат е лимитът от 2 автомобила. Освободете автомобил, преди да вземете нов.',
          'error'
        )
        return
      }
      if (mine.length === 1) {
        setConfirmTake({ plate: mine[0].registration })
        return
      }
    } catch {
      // Couldn't check the fleet — fall through and let the backend enforce the limit.
    } finally {
      setActing(false)
    }
    setShowTake(true)
  }

  async function doTake({ fuelCashStart, equipment }) {
    setActing(true)
    try {
      await takeCar(carId, { fuelCashStart, equipment })
      setShowTake(false)
      showToast('Автомобилът е записан на ваше име.', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
      await refresh()
    } finally {
      setActing(false)
    }
  }

  async function onAddFuel({ amount, notes }) {
    setActing(true)
    try {
      await addFuelExpense({ carId, amount, notes })
      setShowFuel(false)
      showToast('Разходът за гориво е записан.', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setActing(false)
    }
  }

  async function onRelease(parkedLocation, notes, odometer) {
    setActing(true)
    try {
      await releaseCar(carId, parkedLocation, notes, odometer)
      setShowRelease(false)
      showToast('Автомобилът е освободен.', 'success')
      await refresh()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setActing(false)
    }
  }

  async function onRecordOil(odometer) {
    setActing(true)
    try {
      await recordOilChange(carId, odometer)
      setShowOil(false)
      showToast('Смяната на масло е записана.', 'success')
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

  async function onSaveDocument(payload) {
    setActing(true)
    try {
      await saveVehicleDocument(payload)
      setDocModal(null)
      showToast('Документът е записан.', 'success')
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

  const own = isOwnCar(car)
  const photo = carPhoto(car)
  const oil = oilInfo(car)
  const fmtKm = (v) => (v == null ? '—' : Number(v).toLocaleString('bg-BG') + ' км')
  const isDriver = car.current_driver_id && car.current_driver_id === user?.employee_id
  const canTake = !own && car.status === 'available' && car.active
  const canRelease = !own && car.status === 'in_use' && (isDriver || isAdmin)

  return (
    <div className="page vehicle-detail">
      <BackLink />

      <div className="vehicle-hero">
        <div className="vehicle-hero__media">
          {photo ? (
            <img src={photo} alt={carTitle(car)} />
          ) : (
            <span className="vehicle-hero__noimg" aria-hidden="true">{own ? '🔑' : '🚗'}</span>
          )}
        </div>
        <div className="vehicle-hero__info">
          <div className="vehicle-hero__plate">{car.registration}</div>
          <div className="vehicle-hero__name">{own ? 'по-високо заплащане' : carTitle(car)}</div>
          {car.year ? <div className="vehicle-hero__year">{car.year}</div> : null}
          <div className="vehicle-hero__status">
            <StatusBadge status={car.status} />
            {oil.due ? <span className="oil-badge" title="Нужна е смяна на масло">🛢 Масло</span> : null}
          </div>
          {car.status === 'in_use' && car.current_driver_name ? (
            <div className="vehicle-hero__meta">👤 <span className="who-name">{car.current_driver_name}</span></div>
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

      {/* Own car: always available, no take/park/report — just the pay note */}
      {own ? (
        <div className="own-car-note">
          <div className="own-car-note__title">🔑 {CONFIG.ownCar.label}</div>
          <p>Винаги свободна. Не се взема, паркира или отчита през приложението.</p>
          <p className="own-car-note__pay">
            Шофьорът получава{' '}
            <strong>+{CONFIG.ownCar.payBonus} {CONFIG.currencySymbol}</strong> към заплащането за смяна
            {' '}(напр. 45 → {45 + CONFIG.ownCar.payBonus}, 24 → {24 + CONFIG.ownCar.payBonus}).
          </p>
        </div>
      ) : (
      <div className="vehicle-actions vehicle-actions--bar">
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
      )}

      {/* Fuel money for the active usage session (§15–§20) */}
      {!own && car.status === 'in_use' ? (
        <section className="detail-section">
          <div className="detail-section__head">
            <h2 className="detail-section__title">Гориво</h2>
            {isDriver || isAdmin ? (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setShowFuel(true)}
                disabled={acting}
              >
                Добави разход за гориво
              </button>
            ) : null}
          </div>

          <div className="odo-grid">
            <div className="odo-cell">
              <div className="odo-cell__label">Налични при вземане</div>
              <div className="odo-cell__value">
                {car.fuel_cash_start == null ? '—' : formatEuro(car.fuel_cash_start)}
              </div>
            </div>
            <div className="odo-cell">
              <div className="odo-cell__label">Заредено</div>
              <div className="odo-cell__value">{formatEuro(car.fuel_spent_total || 0)}</div>
            </div>
            <div className="odo-cell">
              <div className="odo-cell__label">Остатък</div>
              <div className="odo-cell__value">
                {car.fuel_cash_remaining == null ? '—' : formatEuro(car.fuel_cash_remaining)}
              </div>
            </div>
          </div>

          {fuelEntries.length > 0 ? (
            <ul className="fuel-list">
              {fuelEntries
                .slice()
                .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
                .map((f) => (
                  <li key={f.fuel_entry_id} className="fuel-item">
                    <span className="fuel-item__who">{f.employee_name}</span>
                    <span className="fuel-item__when">{formatStampBG(f.created_at)}</span>
                    {f.notes ? <span className="fuel-item__note">{f.notes}</span> : null}
                    <span className="fuel-item__amount">{formatEuro(f.amount)}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <div className="empty-state empty-state--sm">Няма записани зареждания.</div>
          )}
        </section>
      ) : null}

      {/* Odometer & oil change — not applicable to the own car */}
      {!own ? (
        <details className="detail-section detail-section--acc">
          <summary className="detail-section__summary">Километраж и масло</summary>
          <div className="detail-section__acc-body">
          {isAdmin ? (
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setShowOil(true)}
              disabled={acting}
            >
              Отбележи смяна на масло
            </button>
          ) : null}

          {oil.due ? (
            <div className="banner banner--warn" role="status">
              🛢 Време е за смяна на масло — изминати {fmtKm(oil.km)} от последната смяна
              (праг {fmtKm(oil.interval)}). Автомобилът може да се използва.
            </div>
          ) : null}

          <div className="odo-grid">
            <div className="odo-cell">
              <div className="odo-cell__label">Текущ километраж</div>
              <div className="odo-cell__value">{fmtKm(oil.lastOdo)}</div>
            </div>
            <div className="odo-cell">
              <div className="odo-cell__label">Последна смяна на масло</div>
              <div className="odo-cell__value">
                {oil.tracked ? fmtKm(oil.lastOilOdo) : '—'}
              </div>
              <div className="odo-cell__sub">
                {oil.lastOilDate ? formatDateBG(oil.lastOilDate) : 'няма запис'}
              </div>
            </div>
            <div className="odo-cell">
              <div className="odo-cell__label">До следваща смяна</div>
              <div className={'odo-cell__value' + (oil.due ? ' odo-cell__value--warn' : '')}>
                {oil.remaining == null ? '—' : oil.due ? 'просрочена' : fmtKm(oil.remaining)}
              </div>
            </div>
          </div>
          </div>
        </details>
      ) : null}

      {/* Documents & deadlines (spec §46–§50) — not applicable to the own car */}
      {!own ? (
        <DocumentsSection
          documents={documents}
          isAdmin={isAdmin}
          onAdd={() => setDocModal({ doc: null })}
          onEdit={(doc) => setDocModal({ doc })}
        />
      ) : null}

      {/* Usage history */}
      {!own ? (
      <details className="detail-section detail-section--acc">
        <summary className="detail-section__summary">История на ползване</summary>
        <div className="detail-section__acc-body">
        {history === null ? (
          <Spinner label="Зареждане на историята…" />
        ) : (
          <UsageHistoryList history={history} />
        )}
        </div>
      </details>
      ) : null}

      {/* Repair history (spec §44) */}
      {!own ? (
      <details className="detail-section detail-section--acc">
        <summary className="detail-section__summary">История на ремонти</summary>
        <div className="detail-section__acc-body">
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
        </div>
      </details>
      ) : null}

      {showRelease ? (
        <ReleaseCarModal
          onClose={() => setShowRelease(false)}
          onSubmit={onRelease}
          submitting={acting}
          lastOdometer={car.last_odometer}
        />
      ) : null}
      {showOil ? (
        <OilChangeModal
          onClose={() => setShowOil(false)}
          onSubmit={onRecordOil}
          submitting={acting}
          lastOdometer={car.last_odometer}
        />
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
      {docModal ? (
        <DocumentModal
          carId={carId}
          doc={docModal.doc}
          onClose={() => setDocModal(null)}
          onSubmit={onSaveDocument}
          submitting={acting}
        />
      ) : null}
      {confirmTake ? (
        <ConfirmModal
          title="Вземане на втори автомобил"
          message={`В момента управлявате автомобил ${confirmTake.plate}. Сигурни ли сте, че искате да вземете и този автомобил?`}
          confirmLabel="Да, продължи"
          cancelLabel="Отказ"
          busyLabel="Обработва се…"
          danger={false}
          busy={acting}
          onConfirm={() => {
            setConfirmTake(null)
            setShowTake(true)
          }}
          onClose={() => setConfirmTake(null)}
        />
      ) : null}
      {showTake ? (
        <TakeCarModal
          onClose={() => setShowTake(false)}
          onSubmit={doTake}
          submitting={acting}
        />
      ) : null}
      {showFuel ? (
        <FuelExpenseModal
          onClose={() => setShowFuel(false)}
          onSubmit={onAddFuel}
          submitting={acting}
          remaining={car.fuel_cash_remaining}
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
