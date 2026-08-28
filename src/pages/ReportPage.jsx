import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { todayISO, shiftISO, weekdayBG, formatDateBG, mondayOfWeekISO } from '../utils/datetime.js'
import { myShiftForDate } from '../utils/work.js'
import { SHIFT_LABELS, formatEuro } from '../utils/shifts.js'
import {
  deliveryTypesForRestaurant,
  DELIVERY_TYPES,
  locationOrderRank,
} from '../config/index.js'
import { getDailyReport, saveDailyReport, getReportsForDate } from '../services/reports/reports.js'
import { getOrdersForWeek } from '../services/orders/orders.js'
import Spinner from '../components/Spinner.jsx'

// Parse a money string ("42,27" / "42.27" / "42") into a number, or null when empty /
// invalid. Accepts a Bulgarian decimal comma. Used to derive per-category sums and the
// delivery count (how many valid amounts were entered).
function parseAmount(str) {
  const s = String(str == null ? '' : str).trim().replace(',', '.')
  if (s === '' || !/^\d+(\.\d{1,2})?$/.test(s)) return null
  return parseFloat(s)
}

// Keep only digits and a single decimal separator while the user types.
function sanitizeAmount(str) {
  return String(str).replace(/[^\d.,]/g, '')
}

// Money value -> editable display string with a Bulgarian decimal comma.
function amountToInput(value) {
  if (!value && value !== 0) return ''
  return String(Number(value)).replace('.', ',')
}

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
  // Each entry is one delivery: { id, type, amount } where amount is the raw input string.
  const [entries, setEntries] = useState([])
  const [ordersCount, setOrdersCount] = useState(null) // from Поръчки, for the cross-check
  const [savedRestaurant, setSavedRestaurant] = useState('') // from an existing report
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const idSeq = useRef(0)
  const newId = () => `e${++idSeq.current}`

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
      const seeded = rows
        .filter((r) => !rest || r.restaurant === rest)
        .map((r) => ({ id: newId(), type: r.delivery_type, amount: amountToInput(r.amount) }))
      setEntries(seeded)
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

  function addEntry(type) {
    setEntries((s) => [...s, { id: newId(), type, amount: '' }])
  }
  function updateEntry(id, amount) {
    setEntries((s) => s.map((e) => (e.id === id ? { ...e, amount: sanitizeAmount(amount) } : e)))
  }
  function removeEntry(id) {
    setEntries((s) => s.filter((e) => e.id !== id))
  }

  // Only entries with a valid amount count as real deliveries.
  const validEntries = useMemo(
    () => entries.filter((e) => parseAmount(e.amount) != null),
    [entries]
  )
  const totalCount = validEntries.length
  const totalSum = useMemo(
    () => validEntries.reduce((n, e) => n + parseAmount(e.amount), 0),
    [validEntries]
  )

  async function save() {
    const deliveries = entries
      .map((e) => ({ delivery_type: e.type, amount: parseAmount(e.amount) }))
      .filter((d) => d.amount != null)
    setSaving(true)
    try {
      await saveDailyReport({ date, restaurant, deliveries })
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
              <p className="report-hint">
                Въведете стойността на всяка доставка (напр. 42,27). Броят доставки се
                изчислява автоматично от въведените стойности.
              </p>

              <div className="report-deliveries">
                {types.map((t) => {
                  const catEntries = entries.filter((e) => e.type === t.key)
                  const catValid = catEntries.filter((e) => parseAmount(e.amount) != null)
                  const catSum = catValid.reduce((n, e) => n + parseAmount(e.amount), 0)
                  return (
                    <section key={t.key} className="delivery-cat">
                      <div className="delivery-cat__head">
                        <span className="delivery-cat__label">{t.label}</span>
                        <span className="delivery-cat__meta">
                          {catValid.length} бр. · {formatEuro(catSum)}
                        </span>
                      </div>

                      <div className="delivery-cat__list">
                        {catEntries.map((e) => (
                          <div key={e.id} className="delivery-entry">
                            <input
                              className="input delivery-entry__input"
                              inputMode="decimal"
                              value={e.amount}
                              onChange={(ev) => updateEntry(e.id, ev.target.value)}
                              placeholder="напр. 42,27"
                            />
                            <span className="delivery-entry__cur">€</span>
                            <button
                              type="button"
                              className="delivery-entry__del"
                              onClick={() => removeEntry(e.id)}
                              aria-label="Изтрий доставката"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm delivery-cat__add"
                          onClick={() => addEntry(t.key)}
                        >
                          + Добави доставка
                        </button>
                      </div>
                    </section>
                  )
                })}
              </div>

              <div className="report-form">
                <div className="report-row report-row--total">
                  <span className="report-row__label">Общо доставки</span>
                  <span className="report-row__input">{totalCount}</span>
                </div>
                <div className="report-row report-row--total">
                  <span className="report-row__label">Обща сума</span>
                  <span className="report-row__input">{formatEuro(totalSum)}</span>
                </div>
              </div>

              {ordersCount != null && ordersCount !== totalCount ? (
                <p className="banner banner--warn" role="status">
                  Поръчки: {ordersCount} · Отчет: {totalCount} доставки. Броят доставки в
                  отчета се различава от въведения брой поръчки.
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
  // Keys (`restaurant|employee_id`) of the worker panels expanded inline.
  const [expanded, setExpanded] = useState(() => new Set())

  const toggle = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

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

  // Group rows: restaurant -> { workers: Map(id -> {name, cats:{type:{count,sum}}, deliveries}),
  // totals: {type: {count, sum}} }. Each row is one delivery with an amount.
  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.restaurant)) map.set(r.restaurant, { workers: new Map(), totals: {} })
      const g = map.get(r.restaurant)
      const id = String(r.employee_id)
      if (!g.workers.has(id))
        g.workers.set(id, { employee_id: id, name: r.employee_name, cats: {}, deliveries: [] })
      const w = g.workers.get(id)
      if (!w.cats[r.delivery_type]) w.cats[r.delivery_type] = { count: 0, sum: 0 }
      w.cats[r.delivery_type].count += 1
      w.cats[r.delivery_type].sum += r.amount
      w.deliveries.push(r)
      if (!g.totals[r.delivery_type]) g.totals[r.delivery_type] = { count: 0, sum: 0 }
      g.totals[r.delivery_type].count += 1
      g.totals[r.delivery_type].sum += r.amount
    }
    return [...map.entries()]
      .sort((a, b) => locationOrderRank(a[0]) - locationOrderRank(b[0]) || a[0].localeCompare(b[0], 'bg'))
      .map(([restaurant, g]) => ({
        restaurant,
        workers: [...g.workers.values()].sort((a, b) => a.name.localeCompare(b.name, 'bg')),
        totals: g.totals,
      }))
  }, [rows])

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

              {/* Workers collapsed to just their name + total; expand to see each receipt. */}
              <div className="report-acc-list">
                {g.workers.map((w) => {
                  const cats = Object.values(w.cats)
                  const count = cats.reduce((a, c) => a + c.count, 0)
                  const sum = cats.reduce((a, c) => a + c.sum, 0)
                  const key = g.restaurant + '|' + w.employee_id
                  const isOpen = expanded.has(key)
                  return (
                    <div key={w.employee_id} className={'report-acc' + (isOpen ? ' report-acc--open' : '')}>
                      <button
                        className="report-acc__head"
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                      >
                        <span className="report-acc__chev" aria-hidden="true">
                          {isOpen ? '▾' : '▸'}
                        </span>
                        <span className="report-acc__name">{w.name}</span>
                        <span className="report-worker__total">
                          {count} бр. · {formatEuro(sum)}
                        </span>
                      </button>

                      {isOpen ? (
                        <div className="report-acc__body">
                          {deliveryTypesForRestaurant(g.restaurant)
                            .filter((t) => w.cats[t.key])
                            .map((t) => {
                              const cat = w.cats[t.key]
                              const items = w.deliveries.filter((d) => d.delivery_type === t.key)
                              return (
                                <div key={t.key} className="report-cat-detail">
                                  <div className="report-row report-row--sm">
                                    <span className="report-row__label">{t.label}</span>
                                    <span className="report-row__input">
                                      {cat.count} бр. · {formatEuro(cat.sum)}
                                    </span>
                                  </div>
                                  <div className="report-cat-detail__items">
                                    {items.map((d) => (
                                      <span key={d.report_id} className="report-chip">
                                        {formatEuro(d.amount)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          <div className="report-row report-row--total">
                            <span className="report-row__label">Общо</span>
                            <span className="report-row__input">
                              {count} бр. · {formatEuro(sum)}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {/* Restaurant-level totals for the day: count + summed value per category. */}
              <div className="report-totals">
                <div className="report-totals__title">Общо за деня</div>
                {DELIVERY_TYPES.filter((t) => g.totals[t.key] != null).map((t) => (
                  <div key={t.key} className="report-row report-row--sm">
                    <span className="report-row__label">{t.label}</span>
                    <span className="report-row__input">
                      {g.totals[t.key].count} бр. · {formatEuro(g.totals[t.key].sum)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
