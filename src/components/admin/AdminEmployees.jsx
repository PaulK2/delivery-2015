import { useEffect, useMemo, useState } from 'react'
import { getEmployees, saveEmployee, resetEmployeePin } from '../../services/employees/employees.js'
import { useToast } from '../../context/ToastContext.jsx'
import Spinner from '../Spinner.jsx'
import Modal from '../Modal.jsx'
import EmployeeModal from './EmployeeModal.jsx'

export default function AdminEmployees() {
  const { showToast } = useToast()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(undefined) // undefined=closed, null=new, obj=edit
  const [resetting, setResetting] = useState(null)
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
              <button className="btn btn--ghost btn--sm" onClick={() => setResetting(e)}>
                PIN
              </button>
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

      {resetting ? (
        <ResetPinModal
          employee={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setResetting(null)
            showToast('PIN е нулиран.', 'success')
          }}
        />
      ) : null}
    </div>
  )
}

function ResetPinModal({ employee, onClose, onDone }) {
  const { showToast } = useToast()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!/^\d{4,6}$/.test(pin)) return setError('PIN трябва да е 4–6 цифри.')
    setBusy(true)
    try {
      await resetEmployeePin(employee.employee_id, pin)
      onDone()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Нов PIN — ${employee.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Отказ
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={busy}>
            {busy ? 'Записване…' : 'Нулирай PIN'}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Нов PIN (4–6 цифри)</span>
        <input
          className="input"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
