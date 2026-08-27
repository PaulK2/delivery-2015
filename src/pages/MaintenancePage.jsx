import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMaintenance, resolveIssue } from '../services/maintenance/maintenance.js'
import { useAutoRefresh } from '../hooks/useAutoRefresh.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  SEVERITY,
  SEVERITY_ORDER,
  severityRank,
  categoryLabel,
  MAINTENANCE_CATEGORY,
  CATEGORY_ORDER,
} from '../utils/vehicles.js'
import { formatStampBG } from '../utils/datetime.js'
import { CONFIG } from '../config/index.js'
import ResolveIssueModal from '../components/ResolveIssueModal.jsx'
import Spinner from '../components/Spinner.jsx'

export default function MaintenancePage() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resolving, setResolving] = useState(null)
  const [acting, setActing] = useState(false)
  const [filters, setFilters] = useState({ status: 'open', severity: '', category: '', vehicle: '' })
  const inFlight = useRef(false)

  async function load({ showSpinner = false, force = false } = {}) {
    if (inFlight.current) return // don't overlap with an in-progress refresh
    inFlight.current = true
    if (showSpinner) setLoading(true)
    try {
      setItems(await getMaintenance({}, { force }))
      setError('')
    } catch (e) {
      setError(e.message || 'Сигналите не могат да бъдат заредени.')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    load({ showSpinner: items.length === 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useAutoRefresh(() => load({ force: true }), CONFIG.autoRefreshMs)

  const filtered = useMemo(() => {
    const v = filters.vehicle.replace(/\s+/g, '').toLowerCase()
    return items
      .filter((m) => {
        if (filters.status && m.status !== filters.status) return false
        if (filters.severity && m.severity !== filters.severity) return false
        if (filters.category && m.category !== filters.category) return false
        if (v && !String(m.registration).replace(/\s+/g, '').toLowerCase().includes(v)) return false
        return true
      })
      .sort(
        (a, b) =>
          severityRank(a.severity) - severityRank(b.severity) ||
          String(b.reported_at).localeCompare(String(a.reported_at))
      )
  }, [items, filters])

  const openCritical = items.filter((m) => m.status === 'open' && m.severity === 'critical').length
  const openTotal = items.filter((m) => m.status === 'open').length

  async function onResolve(payload) {
    setActing(true)
    try {
      await resolveIssue(payload)
      setResolving(null)
      showToast('Проблемът е отстранен.', 'success')
      await load({ force: true })
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Сигнали и поддръжка</h1>
        <button className="btn btn--ghost btn--sm" onClick={() => load({ showSpinner: true, force: true })}>
          ↻ Обнови
        </button>
      </div>

      {!loading ? (
        <div className="fleet-summary">
          <span className="fleet-summary__item">🔧 {openTotal} активни</span>
          {openCritical ? (
            <span className="fleet-summary__item" style={{ color: 'var(--danger)' }}>
              🔴 {openCritical} критични
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="filters">
        <select
          className="input input--sm"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="open">Активни</option>
          <option value="resolved">Отстранени</option>
          <option value="">Всички</option>
        </select>
        <select
          className="input input--sm"
          value={filters.severity}
          onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
        >
          <option value="">Всякаква сериозност</option>
          {SEVERITY_ORDER.slice().reverse().map((s) => (
            <option key={s} value={s}>
              {SEVERITY[s].label}
            </option>
          ))}
        </select>
        <select
          className="input input--sm"
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
        >
          <option value="">Всички категории</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {MAINTENANCE_CATEGORY[c]}
            </option>
          ))}
        </select>
        <input
          className="input input--sm"
          type="search"
          placeholder="Рег. номер…"
          value={filters.vehicle}
          onChange={(e) => setFilters((f) => ({ ...f, vehicle: e.target.value }))}
        />
      </div>

      {loading ? (
        <Spinner label="Зареждане…" />
      ) : error ? (
        <div className="banner banner--error" role="alert">
          {error}
          <button className="btn btn--sm btn--ghost" onClick={() => load({ showSpinner: true, force: true })}>
            Опитай отново
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">Няма сигнали за избраните филтри.</div>
      ) : (
        <ul className="issue-cards">
          {filtered.map((m) => (
            <li
              key={m.maintenance_id}
              className={'issue-card' + (m.severity === 'critical' && m.status === 'open' ? ' issue-card--critical' : '')}
            >
              <div className="issue-card__top">
                <Link to={`/vehicles/${m.car_id}`} className="issue-card__plate">
                  {m.registration}
                </Link>
                <span className={'sev sev--' + (SEVERITY[m.severity]?.cls || 'muted')}>
                  {SEVERITY[m.severity]?.label || m.severity}
                </span>
              </div>
              <div className="issue-card__title">{m.title}</div>
              {m.description ? <div className="issue-card__desc">{m.description}</div> : null}
              <div className="issue-card__meta">
                {categoryLabel(m.category)} · {m.reported_by_name || '—'} · {formatStampBG(m.reported_at)}
              </div>
              {m.status === 'resolved' ? (
                <div className="issue-card__resolved">
                  ✔ Отстранен {formatStampBG(m.resolved_at).split(' ')[0]}
                  {m.repair_description ? ` — ${m.repair_description}` : ''}
                </div>
              ) : isAdmin ? (
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setResolving(m)}
                  disabled={acting}
                >
                  Маркирай като отстранен
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

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
