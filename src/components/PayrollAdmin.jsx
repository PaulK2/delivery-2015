import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useToast } from '../context/ToastContext.jsx'
import { todayISO, mondayOfWeekISO } from '../utils/datetime.js'
import { baseSalaryForWeek } from '../utils/work.js'
import { formatEuro } from '../utils/shifts.js'
import { isWorkerEmployee } from '../config/index.js'
import { getPayrollForWeek, setPayrollPaid } from '../services/payroll/payroll.js'
import { getEmployees } from '../services/employees/employees.js'
import PeriodNav from './PeriodNav.jsx'
import Spinner from './Spinner.jsx'

// Bulgarian label + tone for a payroll payment state.
export function payStatusLabel(p) {
  if (!p || !p.paid) return 'Не е изплатено'
  if (p.received_confirmed) return 'Получено и потвърдено'
  return 'Изплатено'
}
export function payStatusTone(p) {
  if (!p || !p.paid) return 'muted'
  if (p.received_confirmed) return 'ok'
  return 'accent'
}

// Admin weekly payroll: per-worker base + orders + fuel = total, with a mark-paid toggle.
export default function PayrollAdmin() {
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
      <PeriodNav mode="week" value={weekStart} onChange={setWeekStart} />

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
