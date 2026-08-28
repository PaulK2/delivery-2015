import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { todayISO, shiftISO, weekdayBG, formatDateBG, mondayOfWeekISO } from '../utils/datetime.js'
import { myShiftForDate } from '../utils/work.js'
import { SHIFT_LABELS } from '../utils/shifts.js'
import {
  deliveryTypesForRestaurant,
  DELIVERY_TYPES,
  locationOrderRank,
} from '../config/index.js'
import { getDailyReport, saveDailyReport, getReportsForDate } from '../services/reports/reports.js'
import { getOrdersForWeek } from '../services/orders/orders.js'
import Modal from '../components/Modal.jsx'
import Spinner from '../components/Spinner.jsx'

// Prev / Днес / Next day navigator.
function DayNav({ date, onChange }) {
  return (
    <div className="weeknav">
      <button className="btn btn--ghost btn--sm" onClick={() => onChange(shiftISO(date, -1))}>
        ← Предишен ден
      </button>
      <div className="weeknav__label">
        <span>
          {weekdayBG(date)}, {formatDateBG(date)}
        </span>
        {date !== todayISO() ? (
          <button className="btn btn--ghost btn--sm" onClick={() => onChange(todayISO())}>
            Днес
          </button>
        ) : null}
      </div>
      <button className="btn btn--ghost btn--sm" onClick={() => onChange(shiftISO(date, 1))}>
        Следващ ден →
      </button>
    </div>
  )
}

export default function ReportPage() {
  const { isAdmin, isWorker } = useAuth()
  const [tab, setTab] = useState(isWorker ? 'mine' : 'admin')

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Отчет</h1>
      </div>

      {isWorker && isAdmin ? (
        <div className="segmented">
          <button
            className={'segmented__btn' + (tab === 'mine' ? ' segmented__btn--active' : '')}
            onClick={() => setTab('mine')}
          >
            Моят отчет
          </button>
          <button
            className={'segmented__btn' + (tab === 'admin' ? ' segmented__btn--active' : '')}
            onClick={() => setTab('admin')}
          >
            Преглед
          </button>
        </div>
      ) : null}

      {tab === 'mine' && isWorker ? <WorkerReport /> : null}
      {tab === 'admin' && isAdmin ? <AdminReports /> : null}
    </div>
  )
}

/* -------------------------------- Worker view -------------------------------- */

function WorkerReport() {
  const { schedule } = useOutletContext()
  const { user } = useAuth()
  const { showToast } = useToast()

  const [date, setDate] = useState(() => todayISO())
  const [inputs, setInputs] = useState({}) // delivery_type -> string
  const [ordersCount, setOrdersCount] = useState(null) // from Поръчки, for the cross-check
  const [savedRestaurant, setSavedRestaurant] = useState('') // from an existing report
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const shift = useMemo(
    () => myShiftForDate(schedule.entries, user.name, date),
    [schedule, user.name, date]
  )
  // Restaurant from the schedule, or (for a past day the grid no longer covers) from an
  // already-saved report so it stays editable.
  const restaurant = shift?.location_name || savedRestaurant || ''
  const types = useMemo(() => deliveryTypesForRestaurant(restaurant), [restaurant])
  const isFuture = date > todayISO()

  async function load() {
    setLoading(true)
    try {
      const [rows, weekOrders] = await Promise.all([
        getDailyReport({ date, employeeId: user.employee_id, force: true }),
        getOrdersForWeek(mondayOfWeekISO(date), { employeeId: user.employee_id, force: true }),
      ])
      const rest = shift?.location_name || rows[0]?.restaurant || ''
      setSavedRestaurant(rows[0]?.restaurant || '')
      const seeded = {}
      rows
        .filter((r) => !rest || r.restaurant === rest)
        .forEach((r) => {
          seeded[r.delivery_type] = String(r.count)
        })
      setInputs(seeded)
      const ord = weekOrders.find((o) => o.date === date)
      setOrdersCount(ord ? ord.order_count : null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, user.employee_id])

  const total = useMemo(
    () => types.reduce((n, t) => n + (Number(inputs[t.key]) || 0), 0),
    [types, inputs]
  )

  async function save() {
    const counts = {}
    types.forEach((t) => {
      counts[t.key] = Number(inputs[t.key]) || 0
    })
    setSaving(true)
    try {
      await saveDailyReport({ date, restaurant, counts })
      showToast('Отчетът е записан.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <DayNav date={date} onChange={setDate} />

      {loading ? (
        <Spinner label="Зареждане…" />
      ) : !restaurant ? (
        <div className="empty-state">Нямате смяна за избрания ден.</div>
      ) : (
        <>
          <div className="report-head">
            <div>
              <div className="report-head__worker">{user.name}</div>
              <div className="report-head__meta">
                {restaurant}
                {shift ? ` · ${SHIFT_LABELS[shift.shift_type]}` : ''} · {formatDateBG(date)}
              </div>
            </div>
          </div>

          {isFuture ? (
            <div className="empty-state">Не може да въвеждате отчет за бъдещ ден.</div>
          ) : (
            <>
              <div className="report-form">
                {types.map((t) => (
                  <label key={t.key} className="report-row">
                    <span className="report-row__label">{t.label}</span>
                    <input
                      className="input report-row__input"
                      inputMode="numeric"
                      value={inputs[t.key] ?? ''}
                      onChange={(e) =>
                        setInputs((s) => ({ ...s, [t.key]: e.target.value.replace(/\D/g, '') }))
                      }
                      placeholder="0"
                    />
                  </label>
                ))}
                <div className="report-row report-row--total">
                  <span className="report-row__label">Общо доставки</span>
                  <span className="report-row__input">{total}</span>
                </div>
              </div>

              {ordersCount != null && ordersCount !== total ? (
                <p className="banner banner--warn" role="status">
                  Поръчки: {ordersCount} · Отчет общо: {total}. Общият брой в отчета се различава
                  от въведения брой поръчки.
                </p>
              ) : null}

              <button className="btn btn--primary btn--block" onClick={save} disabled={saving}>
                {saving ? 'Записване…' : 'Запази'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------- Admin overview ------------------------------ */

function AdminReports() {
  const [date, setDate] = useState(() => todayISO())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null) // { restaurant, employee_id, name }

  async function load() {
    setLoading(true)
    try {
      setRows(await getReportsForDate(date, { force: true }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  // Group rows: restaurant -> { workers: Map(id -> {name, counts}), totals: {type: sum} }.
  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.restaurant)) map.set(r.restaurant, { workers: new Map(), totals: {} })
      const g = map.get(r.restaurant)
      const id = String(r.employee_id)
      if (!g.workers.has(id)) g.workers.set(id, { employee_id: id, name: r.employee_name, counts: {} })
      g.workers.get(id).counts[r.delivery_type] = r.count
      g.totals[r.delivery_type] = (g.totals[r.delivery_type] || 0) + r.count
    }
    return [...map.entries()]
      .sort((a, b) => locationOrderRank(a[0]) - locationOrderRank(b[0]) || a[0].localeCompare(b[0], 'bg'))
      .map(([restaurant, g]) => ({
        restaurant,
        workers: [...g.workers.values()].sort((a, b) => a.name.localeCompare(b.name, 'bg')),
        totals: g.totals,
      }))
  }, [rows])

  const openReport = useMemo(() => {
    if (!open) return null
    const g = grouped.find((x) => x.restaurant === open.restaurant)
    const w = g?.workers.find((x) => x.employee_id === open.employee_id)
    return w ? { ...w, restaurant: open.restaurant } : null
  }, [open, grouped])

  return (
    <div>
      <DayNav date={date} onChange={setDate} />

      {loading ? (
        <Spinner label="Зареждане…" />
      ) : grouped.length === 0 ? (
        <div className="empty-state">Няма отчети за избрания ден.</div>
      ) : (
        <div className="report-groups">
          {grouped.map((g) => (
            <section key={g.restaurant} className="report-group">
              <h2 className="report-group__title">{g.restaurant}</h2>

              <div className="report-group__workers">
                {g.workers.map((w) => (
                  <button
                    key={w.employee_id}
                    className="report-worker"
                    onClick={() => setOpen({ restaurant: g.restaurant, employee_id: w.employee_id })}
                  >
                    <span>{w.name}</span>
                    <span className="report-worker__total">
                      {Object.values(w.counts).reduce((a, b) => a + b, 0)}
                    </span>
                  </button>
                ))}
              </div>

              {/* Restaurant-level totals for the day (§39) */}
              <div className="report-totals">
                <div className="report-totals__title">Общо за деня</div>
                {DELIVERY_TYPES.filter((t) => g.totals[t.key] != null).map((t) => (
                  <div key={t.key} className="report-row report-row--sm">
                    <span className="report-row__label">{t.label}</span>
                    <span className="report-row__input">{g.totals[t.key]}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {openReport ? (
        <Modal title="Отчет" onClose={() => setOpen(null)}>
          <div className="report-receipt">
            <div className="report-receipt__head">
              <strong>{openReport.name}</strong>
              <div className="report-receipt__meta">
                {openReport.restaurant} · {formatDateBG(date)}
              </div>
            </div>
            <hr />
            {deliveryTypesForRestaurant(openReport.restaurant).map((t) => (
              <div key={t.key} className="report-row report-row--sm">
                <span className="report-row__label">{t.label}</span>
                <span className="report-row__input">{openReport.counts[t.key] || 0}</span>
              </div>
            ))}
            <hr />
            <div className="report-row report-row--total">
              <span className="report-row__label">Общо</span>
              <span className="report-row__input">
                {Object.values(openReport.counts).reduce((a, b) => a + b, 0)}
              </span>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
