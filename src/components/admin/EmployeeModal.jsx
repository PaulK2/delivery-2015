import { useState } from 'react'
import Modal from '../Modal.jsx'

// Add / edit an employee (spec §73).
export default function EmployeeModal({ employee, onClose, onSubmit, submitting }) {
  const isNew = !employee
  const [name, setName] = useState(employee?.name || '')
  const [role, setRole] = useState(employee?.role || 'employee')
  const [active, setActive] = useState(employee ? employee.active : true)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  function submit() {
    if (!name.trim()) return setError('Въведете име.')
    if (isNew && !/^\d{4,6}$/.test(pin)) return setError('PIN трябва да е 4–6 цифри.')
    onSubmit({
      employee_id: employee?.employee_id,
      name: name.trim(),
      role,
      active,
      ...(isNew ? { pin } : {}),
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
        <label className="field">
          <span className="field__label">Начален PIN (4–6 цифри)</span>
          <input
            className="input"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </label>
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
