import { useEffect, useMemo, useState } from 'react'
import { getEmployees, saveEmployee, deleteEmployee } from '../../services/employees/employees.js'
import { useToast } from '../../context/ToastContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import Spinner from '../Spinner.jsx'
import EmployeeModal from './EmployeeModal.jsx'
import ConfirmModal from '../ConfirmModal.jsx'

export default function AdminEmployees() {
  const { showToast } = useToast()
  const { user } = useAuth()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(undefined) // undefined=closed, null=new, obj=edit
  const [deleting, setDeleting] = useState(null) // employee pending deletion, or null
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      setList(await getEmployees())
    } catch (e) {
      setError(e.message || 'Грешка при зареждане.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    const arr = list || []
    return n ? arr.filter((e) => e.name.toLowerCase().includes(n)) : arr
  }, [list, q])

  async function onSave(emp) {
    setBusy(true)
    try {
      await saveEmployee(emp)
      setEditing(undefined)
      showToast('Служителят е записан.', 'success')
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
      await deleteEmployee(deleting.employee_id)
      setDeleting(null)
      showToast('Служителят е изтрит.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (list === null) return error ? <div className="banner banner--error">{error}</div> : <Spinner label="Зареждане…" />

  return (
    <div>
      <div className="admin-toolbar">
        <input
          className="input input--sm"
          type="search"
          placeholder="Търсене на служител…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn--primary btn--sm" onClick={() => setEditing(null)}>
          + Нов служител
        </button>
      </div>

      <ul className="admin-list">
        {filtered.map((e) => (
          <li key={e.employee_id} className="admin-row">
            <div className="admin-row__main">
              <span className="admin-row__name">{e.name}</span>
              <span className="admin-row__tags">
                {e.role === 'admin' ? <span className="tag tag--accent">Админ</span> : null}
                {!e.active ? <span className="tag tag--muted">Неактивен</span> : null}
              </span>
            </div>
            <div className="admin-row__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => setEditing(e)}>
                Редактирай
              </button>
              {e.employee_id !== user?.employee_id ? (
                <button className="btn btn--danger-ghost btn--sm" onClick={() => setDeleting(e)}>
                  Изтрий
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {editing !== undefined ? (
        <EmployeeModal
          employee={editing}
          onClose={() => setEditing(undefined)}
          onSubmit={onSave}
          submitting={busy}
        />
      ) : null}

      {deleting ? (
        <ConfirmModal
          title="Изтриване на служител"
          message={`Сигурни ли сте, че искате да изтриете ${deleting.name}? Действието е необратимо.`}
          onConfirm={onDelete}
          onClose={() => setDeleting(null)}
          busy={busy}
        />
      ) : null}
    </div>
  )
}
