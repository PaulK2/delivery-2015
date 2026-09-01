import { useEffect, useMemo, useState } from 'react'
import { getAllCars, saveCar, deleteCar, bootstrapCarAssignments } from '../../services/fleet/fleet.js'
import { getSchedule } from '../../services/schedule/schedule.js'
import { getEmployees } from '../../services/employees/employees.js'
import { useToast } from '../../context/ToastContext.jsx'
import { carTitle, resolveScheduleCar, normalizePlate } from '../../utils/vehicles.js'
import { scheduleEntriesForDate, todayISO } from '../../utils/datetime.js'
import StatusBadge from '../StatusBadge.jsx'
import Spinner from '../Spinner.jsx'
import VehicleModal from './VehicleModal.jsx'
import ConfirmModal from '../ConfirmModal.jsx'
import Modal from '../Modal.jsx'

const nameKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')

export default function AdminVehicles() {
  const { showToast } = useToast()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(undefined)
  const [deleting, setDeleting] = useState(null) // car pending deletion, or null
  const [busy, setBusy] = useState(false)
  const [bootstrapPlan, setBootstrapPlan] = useState(null) // computed assignments pending confirmation, or null
  const [bootstrapping, setBootstrapping] = useState(false)

  async function load() {
    setError('')
    try {
      setList(await getAllCars())
    } catch (e) {
      setError(e.message || 'Грешка при зареждане.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const n = q.replace(/\s+/g, '').toLowerCase()
    const arr = list || []
    return n
      ? arr.filter(
          (c) => c.registration.replace(/\s+/g, '').toLowerCase().includes(n) || carTitle(c).toLowerCase().includes(n)
        )
      : arr
  }, [list, q])

  async function onSave(car) {
    setBusy(true)
    try {
      await saveCar(car)
      setEditing(undefined)
      showToast('Автомобилът е записан.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    setBusy(true)
    try {
      await deleteCar(deleting.car_id)
      setDeleting(null)
      showToast('Автомобилът е изтрит.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusy(false)
    }
  }

  // One-time initial-activation helper: reads today's schedule car notes (same fuzzy
  // plate matching the График page already uses) and turns them into
  // {employeeId, employeeName, plate} pairs, matching employee NAMES from the schedule
  // to real accounts. Shows a confirmation summary before writing anything.
  async function onPlanBootstrap() {
    setBusy(true)
    try {
      const [schedule, employees] = await Promise.all([getSchedule(), getEmployees()])
      const todayEntries = scheduleEntriesForDate(schedule.entries, todayISO())
      const empByName = new Map(employees.map((e) => [nameKey(e.name), e]))
      const known = (list || [])
        .map((c) => ({ car_id: c.car_id, plate: normalizePlate(c.registration) }))
        .filter((k) => k.plate)

      const assignments = []
      const unmatchedNames = new Set()
      for (const e of todayEntries) {
        if (!e.car) continue
        const resolved = resolveScheduleCar(e.car, known)
        if (!resolved?.plate) continue
        const emp = empByName.get(nameKey(e.employee_name))
        if (!emp) {
          unmatchedNames.add(e.employee_name)
          continue
        }
        assignments.push({ employeeId: emp.employee_id, employeeName: emp.name, plate: resolved.plate })
      }

      if (!assignments.length) {
        showToast('Няма коли за присвояване от днешния график.', 'error')
        return
      }
      setBootstrapPlan({ assignments, unmatchedNames: [...unmatchedNames] })
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onConfirmBootstrap() {
    setBootstrapping(true)
    try {
      const res = await bootstrapCarAssignments(bootstrapPlan.assignments)
      setBootstrapPlan(null)
      showToast(
        `Присвоени: ${res.assigned.length} · нови коли: ${res.created.length} · пропуснати: ${res.skipped.length}`,
        'success'
      )
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBootstrapping(false)
    }
  }

  if (list === null) return error ? <div className="banner banner--error">{error}</div> : <Spinner label="Зареждане…" />

  return (
    <div>
      <p className="admin-hint">
        „Присвои по днешния график“ е за първоначалното активиране на приложението —
        присвоява всяка кола от днешния график на съответния служител (все едно я е
        взел), включително създава нова кола за непозната регистрация. След това
        служителите вземат/освобождават колите ръчно както обичайно.
      </p>

      <div className="admin-toolbar">
        <input
          className="input input--sm"
          type="search"
          placeholder="Рег. номер или марка…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn--ghost btn--sm" onClick={onPlanBootstrap} disabled={busy}>
          Присвои по днешния график
        </button>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing(null)}>
          + Нов автомобил
        </button>
      </div>

      <ul className="admin-list">
        {filtered.map((c) => (
          <li key={c.car_id} className="admin-row">
            <div className="admin-row__main">
              <span className="admin-row__name">{c.registration}</span>
              <span className="admin-row__sub">
                {carTitle(c)}
                {!c.active ? <span className="tag tag--muted">Неактивен</span> : null}
                {c.needs_review ? <span className="tag tag--warn">❓ За преглед</span> : null}
              </span>
            </div>
            <div className="admin-row__actions">
              <StatusBadge status={c.status} />
              <button className="btn btn--ghost btn--sm" onClick={() => setEditing(c)}>
                Редактирай
              </button>
              <button className="btn btn--danger-ghost btn--sm" onClick={() => setDeleting(c)}>
                Изтрий
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing !== undefined ? (
        <VehicleModal car={editing} onClose={() => setEditing(undefined)} onSubmit={onSave} submitting={busy} />
      ) : null}

      {deleting ? (
        <ConfirmModal
          title="Изтриване на автомобил"
          message={`Сигурни ли сте, че искате да изтриете ${deleting.registration}? Действието е необратимо.`}
          onConfirm={onDelete}
          onClose={() => setDeleting(null)}
          busy={busy}
        />
      ) : null}

      {bootstrapPlan ? (
        <Modal
          title="Присвояване по днешния график"
          onClose={() => setBootstrapPlan(null)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => setBootstrapPlan(null)} disabled={bootstrapping}>
                Отказ
              </button>
              <button className="btn btn--primary" onClick={onConfirmBootstrap} disabled={bootstrapping}>
                {bootstrapping ? 'Присвояване…' : `Присвои ${bootstrapPlan.assignments.length} коли`}
              </button>
            </>
          }
        >
          <ul className="admin-list">
            {bootstrapPlan.assignments.map((a, i) => (
              <li key={i} className="admin-row">
                <div className="admin-row__main">
                  <span className="admin-row__name">{a.plate}</span>
                  <span className="admin-row__sub">{a.employeeName}</span>
                </div>
              </li>
            ))}
          </ul>
          {bootstrapPlan.unmatchedNames.length ? (
            <p className="form-error">
              Няма профил за: {bootstrapPlan.unmatchedNames.join(', ')} — техните коли няма да бъдат присвоени.
            </p>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}
