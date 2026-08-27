import { useState } from 'react'
import Modal from './Modal.jsx'

// Admin: record an oil change. Odometer defaults to the car's last known reading.
export default function OilChangeModal({ onClose, onSubmit, submitting, lastOdometer }) {
  const prev = lastOdometer == null ? null : Number(lastOdometer)
  const [odometer, setOdometer] = useState(prev != null ? String(prev) : '')
  const [error, setError] = useState('')

  function submit() {
    if (!/^\d+$/.test(odometer)) {
      setError('Въведете километража при смяната.')
      return
    }
    onSubmit(Number(odometer))
  }

  return (
    <Modal
      title="Отбелязване на смяна на масло"
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
        <span className="field__label">Километраж при смяната (км)</span>
        <input
          className="input"
          inputMode="numeric"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
        <span className="field__hint">Датата се записва автоматично (днес).</span>
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
