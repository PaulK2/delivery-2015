import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { todayISO, formatDateBG, mondayOfWeekISO } from '../utils/datetime.js'
import { myShiftForDate, baseSalaryForWeek } from '../utils/work.js'
import { SHIFT_LABELS, formatEuro } from '../utils/shifts.js'
import { deliveryTypesForRestaurant, ORDER_RATE_EUR } from '../config/index.js'
import { getDailyReport, saveDailyReport } from '../services/reports/reports.js'
import { getOrdersForWeek, saveOrderCount } from '../services/orders/orders.js'
import { getFuelExpensesForWeek } from '../services/fuel/fuel.js'
import { getMyPayroll, confirmPayrollReceived } from '../services/payroll/payroll.js'
import PeriodNav from '../components/PeriodNav.jsx'
import Spinner from '../components/Spinner.jsx'
import AdminReports from '../components/AdminReports.jsx'
import PayrollAdmin, { payStatusLabel, payStatusTone } from '../components/PayrollAdmin.jsx'

/* ------------------------------- money helpers ------------------------------- */

// Parse a money string ("42,27" / "42.27" / "42") into a number, or null when invalid.
function parseAmount(str) {
  const s = String(str == null ? '' : str).trim().replace(',', '.')
  if (s === '' || !/^\d+(\.\d{1,2})?$/.test(s)) return null
  return parseFloat(s)
}
function sanitizeAmount(str) {
  return String(str).replace(/[^\d.,]/g, '')
}
function amountToInput(value) {
  if (!value && value !== 0) return ''
  return String(Number(value)).replace('.', ',')
}
const validCount = (list) => list.filter((e) => parseAmount(e.amount) != null).length

/* ------------------------------- page shell ------------------------------- */

export default function DayPage() {
  const { isAdmin, isWorker } = useAuth()
  // Regular workers → just their own day. Worker-admins → all three. Review-only admins
  // → the two overviews.
  const [tab, setTab] = useState(isWorker ? 'mine' : 'reports')

  const tabs = []
  if (isWorker) tabs.push(['mine', 'Моят ден'])
  if (isAdmin) tabs.push(['reports', 'Отчети'], ['payroll', 'Заплати'])

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Моят ден</h1>
      </div>

      {tabs.length > 1 ? (
        <div className="segmented">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              className={'segmented__btn' + (tab === key ? ' segmented__btn--active' : '')}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'mine' && isWorker ? <WorkerDay /> : null}
      {tab === 'reports' && isAdmin ? <AdminReports /> : null}
      {tab === 'payroll' && isAdmin ? <PayrollAdmin /> : null}
    </div>
  )
}

/* ------------------------------- worker view ------------------------------- */

function WorkerDay() {
  const { schedule } = useOutletContext()
  const { user } = useAuth()
  const { showToast } = useToast()

  const [date, setDate] = useState(() => todayISO())
  // Each entry is one delivery: { id, type, amount } (amount is the raw input string).
  const [entries, setEntries] = useState([])
  const [countInput, setCountInput] = useState('0')
  const [countEdited, setCountEdited] = useState(false)
  const [savedRestaurant, setSavedRestaurant] = useState('')
  const [savedOrder, setSavedOrder] = useState(null)
  const [weekOrders, setWeekOrders] = useState([])
  const [myFuel, setMyFuel] = useState([])
  const [payroll, setPayroll] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const idSeq = useRef(0)
  const newId = () => `e${++idSeq.current}`

  const weekStart = mondayOfWeekISO(date)
  const shift = useMemo(
    () => myShiftForDate(schedule.entries, user.name, date),
    [schedule, user.name, date]
  )
  const restaurant = shift?.location_name || savedRestaurant || ''
  const types = useMemo(() => deliveryTypesForRestaurant(restaurant), [restaurant])
  const isFuture = date > todayISO()

  async function load() {
    setLoading(true)
    try {
      const [rows, weekOrd, fuel, pay] = await Promise.all([
        getDailyReport({ date, employeeId: user.employee_id, force: true }),
        getOrdersForWeek(weekStart, { employeeId: user.employee_id, force: true }),
        getFuelExpensesForWeek(weekStart, { force: true }),
        getMyPayroll(weekStart, { force: true }),
      ])
      const rest = shift?.location_name || rows[0]?.restaurant || ''
      setSavedRestaurant(rows[0]?.restaurant || '')
      const seeded = rows
        .filter((r) => !rest || r.restaurant === rest)
        .map((r) => ({ id: newId(), type: r.delivery_type, amount: amountToInput(r.amount) }))
      setEntries(seeded)

      const order = weekOrd.find((o) => o.date === date) || null
      setSavedOrder(order)
      setWeekOrders(weekOrd)
      setMyFuel(fuel.filter((f) => String(f.employee_id) === String(user.employee_id)))
      setPayroll(pay)

      // Seed the order count: prefer a saved count that differs from the itemised count
      // (a manual entry); otherwise keep it auto-synced to the itemised deliveries.
      const derived = validCount(seeded)
      if (order && order.order_count != null && order.order_count !== derived) {
        setCountEdited(true)
        setCountInput(String(order.order_count))
      } else {
        setCountEdited(false)
        setCountInput(String(derived))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, user.employee_id])

  // Keep the order count in step with the itemised deliveries until the user overrides it.
  function syncCount(nextEntries) {
    if (!countEdited) setCountInput(String(validCount(nextEntries)))
  }
  function addEntry(type) {
    setEntries((s) => {
      const next = [...s, { id: newId(), type, amount: '' }]
      return next
    })
  }
  function updateEntry(id, amount) {
    setEntries((s) => {
      const next = s.map((e) => (e.id === id ? { ...e, amount: sanitizeAmount(amount) } : e))
      syncCount(next)
      return next
    })
  }
  function removeEntry(id) {
    setEntries((s) => {
      const next = s.filter((e) => e.id !== id)
      syncCount(next)
      return next
    })
  }

  const validEntries = useMemo(() => entries.filter((e) => parseAmount(e.amount) != null), [entries])
  const itemisedCount = validEntries.length
  const totalSum = useMemo(
    () => validEntries.reduce((n, e) => n + parseAmount(e.amount), 0),
    [validEntries]
  )
  const effectiveCount = countEdited ? Number(countInput || 0) : itemisedCount

  // Weekly pay summary (uses saved data for the week).
  const totals = useMemo(() => {
    const base = baseSalaryForWeek(schedule.entries, user.name, weekStart)
    const ordersSalary = weekOrders.reduce((n, o) => n + (o.order_salary || 0), 0)
    const ordersCount = weekOrders.reduce((n, o) => n + (o.order_count || 0), 0)
    const fuelSalary = myFuel.reduce((n, f) => n + (f.amount || 0), 0)
    return { base, ordersSalary, ordersCount, fuelSalary, final: base + ordersSalary + fuelSalary }
  }, [schedule, user.name, weekStart, weekOrders, myFuel])

  async function save() {
    const deliveries = entries
      .map((e) => ({ delivery_type: e.type, amount: parseAmount(e.amount) }))
      .filter((d) => d.amount != null)
    setSaving(true)
    try {
      // One action writes both: the itemised report AND the order count that feeds pay,
      // so nothing is entered twice and the two can never disagree.
      await saveDailyReport({ date, restaurant, deliveries })
      await saveOrderCount({ date, orderCount: effectiveCount, restaurant, shiftType: shift?.shift_type || savedOrder?.shift_type || '' })
      showToast('Записано.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function onConfirmReceived() {
    setConfirming(true)
    try {
      await confirmPayrollReceived(weekStart)
      showToast('Потвърдихте получаването на плащането.', 'success')
      setPayroll(await getMyPayroll(weekStart, { force: true }))
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div>
      <PeriodNav mode="day" value={date} onChange={setDate} />

      {loading ? (
        <Spinner label="Зареждане…" />
      ) : !restaurant ? (
        <div className="empty-state">
          Нямате смяна за избрания ден.
          <div className="empty-state__hint">Изберете друг ден със стрелките горе.</div>
        </div>
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
                За всяка доставка въведете стойността ѝ (напр. 42,27). Броят поръчки за
                заплащане се пресмята сам от въведените стойности.
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
                <div className="report-row">
                  <span className="report-row__label">Брой поръчки за заплащане</span>
                  <input
                    className="input report-count-input"
                    inputMode="numeric"
                    value={countInput}
                    onChange={(ev) => {
                      setCountEdited(true)
                      setCountInput(ev.target.value.replace(/\D/g, ''))
                    }}
                  />
                </div>
                <div className="report-count-meta">
                  {countEdited && Number(countInput || 0) !== itemisedCount ? (
                    <button
                      type="button"
                      className="report-sync"
                      onClick={() => {
                        setCountEdited(false)
                        setCountInput(String(itemisedCount))
                      }}
                    >
                      Изчисли от доставките ({itemisedCount})
                    </button>
                  ) : (
                    <span className="report-count-note">Изчислено от доставките.</span>
                  )}
                </div>
                <div className="report-row report-row--total">
                  <span className="report-row__label">Заплащане от поръчки</span>
                  <span className="report-row__input">{formatEuro(effectiveCount * ORDER_RATE_EUR)}</span>
                </div>
                <div className="report-row report-row--total">
                  <span className="report-row__label">Обща сума на доставките</span>
                  <span className="report-row__input">{formatEuro(totalSum)}</span>
                </div>
              </div>

              <button className="btn btn--primary btn--block" onClick={save} disabled={saving}>
                {saving ? 'Записване…' : 'Запази'}
              </button>
            </>
          )}

          <section className="payroll-summary">
            <h2 className="detail-section__title">Заплата за седмицата</h2>
            <div className="payline">
              <span>Основна заплата</span>
              <span>{formatEuro(totals.base)}</span>
            </div>
            <div className="payline">
              <span>Заплата от поръчки ({totals.ordersCount} бр.)</span>
              <span>{formatEuro(totals.ordersSalary)}</span>
            </div>
            <div className="payline">
              <span>Гориво</span>
              <span>{formatEuro(totals.fuelSalary)}</span>
            </div>
            <div className="payline payline--total">
              <span>Общо за плащане</span>
              <span>{formatEuro(totals.final)}</span>
            </div>

            <div className={'pay-status pay-status--' + payStatusTone(payroll)}>
              {payStatusLabel(payroll)}
            </div>
            {payroll && payroll.paid && !payroll.received_confirmed ? (
              <button className="btn btn--primary btn--block" onClick={onConfirmReceived} disabled={confirming}>
                {confirming ? 'Потвърждаване…' : 'Получих плащането'}
              </button>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}
