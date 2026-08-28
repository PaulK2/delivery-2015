import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  todayISO,
  mondayOfWeekISO,
  weekRangeLabel,
  shiftISO,
  weekdayNameByIndex,
  weekdayIndex,
} from '../utils/datetime.js'
import { weekDatesISO, myShiftForDate, baseSalaryForWeek } from '../utils/work.js'
import { formatEuro, SHIFT_LABELS } from '../utils/shifts.js'
import { ORDER_RATE_EUR, isWorkerEmployee } from '../config/index.js'
import { getOrdersForWeek, saveOrderCount } from '../services/orders/orders.js'
import { getFuelExpensesForWeek } from '../services/fuel/fuel.js'
import {
  getMyPayroll,
  confirmPayrollReceived,
  getPayrollForWeek,
  setPayrollPaid,
} from '../services/payroll/payroll.js'
import { getEmployees } from '../services/employees/employees.js'
import Spinner from '../components/Spinner.jsx'

// Bulgarian label for a payroll payment state (§14).
function payStatusLabel(p) {
  if (!p || !p.paid) return 'Не е изплатено'
  if (p.received_confirmed) return 'Получено и потвърдено'
  return 'Изплатено'
}
function payStatusTone(p) {
  if (!p || !p.paid) return 'muted'
  if (p.received_confirmed) return 'ok'
  return 'accent'
}

// Reusable prev/today/next week navigator.
function WeekNav({ weekStart, onChange }) {
  return (
    <div className="weeknav">
      <button className="btn btn--ghost btn--sm" onClick={() => onChange(shiftISO(weekStart, -7))}>
        ← Предишна седмица
      </button>
      <div className="weeknav__label">
        <span>{weekRangeLabel(weekStart)}</span>
        {weekStart !== mondayOfWeekISO(todayISO()) ? (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => onChange(mondayOfWeekISO(todayISO()))}
          >
            Тази седмица
          </button>
        ) : null}
      </div>
      <button className="btn btn--ghost btn--sm" onClick={() => onChange(shiftISO(weekStart, 7))}>
        Следваща седмица →
      </button>
    </div>
  )
}

export default function OrdersPage() {
  const { isAdmin, isWorker } = useAuth()
  // Worker-admins (ПАВЕЛ, В. ПЕТКОВ) get both; regular workers only entry; ЦЕЦО/СИМО only
  // the payroll review.
  const [tab, setTab] = useState(isWorker ? 'mine' : 'payroll')

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Поръчки</h1>
      </div>

      {isWorker && isAdmin ? (
        <div className="segmented">
          <button
            className={'segmented__btn' + (tab === 'mine' ? ' segmented__btn--active' : '')}
            onClick={() => setTab('mine')}
          >
            Моите поръчки
          </button>
          <button
            className={'segmented__btn' + (tab === 'payroll' ? ' segmented__btn--active' : '')}
            onClick={() => setTab('payroll')}
          >
            Заплати
          </button>
        </div>
      ) : null}

      {tab === 'mine' && isWorker ? <WorkerOrders /> : null}
      {tab === 'payroll' && isAdmin ? <PayrollAdmin /> : null}
    </div>
  )
}

/* -------------------------------- Worker view -------------------------------- */

function WorkerOrders() {
  const { schedule } = useOutletContext()
  const { user } = useAuth()
  const { showToast } = useToast()

  const [weekStart, setWeekStart] = useState(() => mondayOfWeekISO(todayISO()))
  const [orders, setOrders] = useState([])
  const [myFuel, setMyFuel] = useState([])
  const [payroll, setPayroll] = useState(null)
  const [inputs, setInputs] = useState({}) // dateISO -> string
  const [loading, setLoading] = useState(true)
  const [savingDate, setSavingDate] = useState('')
  const [confirming, setConfirming] = useState(false)

  const today = todayISO()

  async function load() {
    setLoading(true)
    try {
      const [ord, fuel, pay] = await Promise.all([
        getOrdersForWeek(weekStart, { employeeId: user.employee_id, force: true }),
        getFuelExpensesForWeek(weekStart, { force: true }),
        getMyPayroll(weekStart, { force: true }),
      ])
      setOrders(ord)
      // getFuelExpensesForWeek returns all rows for admins — keep only my own.
      setMyFuel(fuel.filter((f) => String(f.employee_id) === String(user.employee_id)))
      setPayroll(pay)
      const seeded = {}
      ord.forEach((o) => {
        seeded[o.date] = String(o.order_count)
      })
      setInputs(seeded)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, user.employee_id])

  const days = useMemo(() => {
    return weekDatesISO(weekStart).map((date) => {
      const shift = myShiftForDate(schedule.entries, user.name, date)
      const order = orders.find((o) => o.date === date) || null
      // A day is a workday if the schedule shows a shift OR an order was already saved
      // for it (so previous weeks the grid no longer covers stay editable).
      const restaurant = shift?.location_name || order?.restaurant || ''
      const shiftType = shift?.shift_type || order?.shift_type || ''
      return { date, shift, order, restaurant, shiftType, isWorkday: !!(shift || order) }
    })
  }, [weekStart, schedule, user.name, orders])

  const totals = useMemo(() => {
    const ordersCount = orders.reduce((n, o) => n + (o.order_count || 0), 0)
    const ordersSalary = orders.reduce((n, o) => n + (o.order_salary || 0), 0)
    const base = baseSalaryForWeek(schedule.entries, user.name, weekStart)
    const fuelSalary = myFuel.reduce((n, f) => n + (f.amount || 0), 0)
    return { ordersCount, ordersSalary, base, fuelSalary, final: base + ordersSalary + fuelSalary }
  }, [orders, myFuel, schedule, user.name, weekStart])

  async function saveDay(date, restaurant, shiftType) {
    const raw = String(inputs[date] ?? '').trim()
    if (raw === '' || !/^\d+$/.test(raw)) {
      showToast('Въведете брой поръчки (цяло число).', 'error')
      return
    }
    setSavingDate(date)
    try {
      await saveOrderCount({
        date,
        orderCount: Number(raw),
        restaurant,
        shiftType,
      })
      showToast('Броят поръчки е записан.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setSavingDate('')
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
      <WeekNav weekStart={weekStart} onChange={setWeekStart} />

      {loading ? (
        <Spinner label="Зареждане…" />
      ) : (
        <>
          <div className="day-cards">
            {days.map(({ date, shift, order, restaurant, shiftType, isWorkday }) => {
              const wd = weekdayIndex(date)
              const isFuture = date > today
              const count = Number(inputs[date] || 0)
              return (
                <div
                  key={date}
                  className={'day-card' + (isWorkday ? ' day-card--shift' : ' day-card--off')}
                >
                  <div className="day-card__head">
                    <span className="day-card__weekday">{weekdayNameByIndex(wd)}</span>
                    <span className="day-card__date">{weekRangeLabel(date).slice(0, 5)}</span>
                  </div>

                  {isWorkday ? (
                    <>
                      <div className="day-card__shift">
                        <span className="day-card__loc">{restaurant || '—'}</span>
                        {shiftType ? (
                          <span className="day-card__badge">{SHIFT_LABELS[shiftType]}</span>
                        ) : null}
                        {!shift ? <span className="day-card__date">(извън графика)</span> : null}
                      </div>

                      {isFuture ? (
                        <div className="day-card__future">Предстои — въведете след смяната.</div>
                      ) : (
                        <div className="day-card__entry">
                          <label className="field field--inline">
                            <span className="field__label">Брой поръчки</span>
                            <input
                              className="input"
                              inputMode="numeric"
                              value={inputs[date] ?? ''}
                              onChange={(e) =>
                                setInputs((s) => ({
                                  ...s,
                                  [date]: e.target.value.replace(/\D/g, ''),
                                }))
                              }
                              placeholder="напр. 42"
                            />
                          </label>
                          <div className="day-card__pay">
                            {formatEuro(count * ORDER_RATE_EUR)}
                          </div>
                          <button
                            className="btn btn--primary btn--sm"
                            onClick={() => saveDay(date, restaurant, shiftType)}
                            disabled={savingDate === date}
                          >
                            {savingDate === date ? 'Записване…' : 'Запази'}
                          </button>
                        </div>
                      )}
                      {order ? (
                        <div className="day-card__saved">
                          Записано: {order.order_count} поръчки · {formatEuro(order.order_salary)}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="day-card__none">Няма смяна</div>
                  )}
                </div>
              )
            })}
          </div>

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
              <button
                className="btn btn--primary btn--block"
                onClick={onConfirmReceived}
                disabled={confirming}
              >
                {confirming ? 'Потвърждаване…' : 'Получих плащането'}
              </button>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}

/* ------------------------------- Admin payroll ------------------------------- */

function PayrollAdmin() {
  const { schedule } = useOutletContext()
  const { showToast } = useToast()

  const [weekStart, setWeekStart] = useState(() => mondayOfWeekISO(todayISO()))
  const [employees, setEmployees] = useState([])
  const [data, setData] = useState({ payroll: [], orders: [], fuel: [] })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [emps, pay] = await Promise.all([
        getEmployees(),
        getPayrollForWeek(weekStart, { force: true }),
      ])
      setEmployees(emps)
      setData(pay)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart])

  const rows = useMemo(() => {
    const ordersById = new Map(data.orders.map((o) => [String(o.employee_id), o]))
    const fuelById = new Map(data.fuel.map((f) => [String(f.employee_id), f]))
    const payById = new Map(data.payroll.map((p) => [String(p.employee_id), p]))

    return employees
      .filter((e) => e.active && isWorkerEmployee(e.role, e.name))
      .map((e) => {
        const id = String(e.employee_id)
        const state = payById.get(id) || null
        const ord = ordersById.get(id)
        const fuel = fuelById.get(id)
        // Live figures; once paid, prefer the snapshot for historical integrity.
        const base = baseSalaryForWeek(schedule.entries, e.name, weekStart)
        const ordersCount = ord?.orders_count || 0
        const ordersSalary = ord?.orders_salary || 0
        const fuelSalary = fuel?.fuel_salary || 0
        const liveFinal = base + ordersSalary + fuelSalary

        const usingSnapshot = state && state.paid
        return {
          employee_id: id,
          name: e.name,
          base: usingSnapshot && state.base_salary != null ? state.base_salary : base,
          ordersCount:
            usingSnapshot && state.orders_count != null ? state.orders_count : ordersCount,
          ordersSalary:
            usingSnapshot && state.orders_salary != null ? state.orders_salary : ordersSalary,
          fuelSalary:
            usingSnapshot && state.fuel_salary != null ? state.fuel_salary : fuelSalary,
          final: usingSnapshot && state.final_amount != null ? state.final_amount : liveFinal,
          state,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'bg'))
  }, [employees, data, schedule, weekStart])

  async function togglePaid(row) {
    setBusyId(row.employee_id)
    try {
      await setPayrollPaid({
        employeeId: row.employee_id,
        employeeName: row.name,
        weekStart,
        baseSalary: row.base,
        ordersCount: row.ordersCount,
        ordersSalary: row.ordersSalary,
        fuelSalary: row.fuelSalary,
        finalAmount: row.final,
        paid: !(row.state && row.state.paid),
      })
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div>
      <WeekNav weekStart={weekStart} onChange={setWeekStart} />

      {loading ? (
        <Spinner label="Зареждане…" />
      ) : rows.length === 0 ? (
        <div className="empty-state">Няма служители за заплащане.</div>
      ) : (
        <div className="payroll-cards">
          {rows.map((r) => (
            <div key={r.employee_id} className="payroll-card">
              <div className="payroll-card__name">{r.name}</div>
              <div className="payline">
                <span>Основна заплата</span>
                <span>{formatEuro(r.base)}</span>
              </div>
              <div className="payline">
                <span>Поръчки ({r.ordersCount} бр.)</span>
                <span>{formatEuro(r.ordersSalary)}</span>
              </div>
              <div className="payline">
                <span>Гориво</span>
                <span>{formatEuro(r.fuelSalary)}</span>
              </div>
              <div className="payline payline--total">
                <span>Общо за плащане</span>
                <span>{formatEuro(r.final)}</span>
              </div>

              <div className="payroll-card__foot">
                <span className={'pay-status pay-status--' + payStatusTone(r.state)}>
                  {payStatusLabel(r.state)}
                </span>
                <button
                  className={'btn btn--sm ' + (r.state && r.state.paid ? 'btn--ghost' : 'btn--primary')}
                  onClick={() => togglePaid(r)}
                  disabled={busyId === r.employee_id}
                >
                  {busyId === r.employee_id
                    ? '…'
                    : r.state && r.state.paid
                      ? 'Отмени изплащане'
                      : 'Изплатено'}
                </button>
              </div>
              {r.state && r.state.paid ? (
                <div className="payroll-card__meta">
                  Отбелязал: {r.state.paid_by_name || '—'}
                  {r.state.received_confirmed ? ' · потвърдено от служителя' : ''}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
