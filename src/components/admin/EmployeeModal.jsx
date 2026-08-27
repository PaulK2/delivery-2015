import { useState } from 'react'
import Modal from '../Modal.jsx'

// Add / edit an employee (spec §73).
export default function EmployeeModal({ employee, onClose, onSubmit, submitting }) {
  const isNew = !employee
  const [name, setName] = useState(employee?.name || '')
  const [role, setRole] = useState(employee?.role || 'employee')
  const [active, setActive] = useState(employee ? employee.active : true)
  const [error, setError] = useState('')

  function submit() {
    if (!name.trim()) return setError('Въведете име.')
    onSubmit({
      employee_id: employee?.employee_id,
      name: name.trim(),
      role,
      active,
    })
  }

  return (
    <Modal
      title={isNew ? 'Нов служител' : 'Редактиране на служител'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Отказ
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Записване…' : 'Запази'}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Име</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span className="field__label">Роля</span>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="employee">Служител</option>
          <option value="admin">Администратор</option>
        </select>
      </label>
      {isNew ? (
        <p className="field__hint">
          Служителят създава своя парола при първото си влизане.
        </p>
      ) : null}
      <label className="checkbox">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>Активен</span>
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
