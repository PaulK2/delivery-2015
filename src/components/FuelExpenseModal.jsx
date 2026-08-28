import { useState } from 'react'
import Modal from './Modal.jsx'
import { formatEuro } from '../utils/shifts.js'

// Record a fuel expense (§16). Amount is required; note optional. The remaining balance
// (starting fuel money minus what's spent) is shown so the driver doesn't calculate it.
export default function FuelExpenseModal({ onClose, onSubmit, submitting, remaining }) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function submit() {
    const value = amount.replace(',', '.')
    if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) {
      setError('Въведете сумата за гориво (в €).')
      return
    }
    onSubmit({ amount: Number(value), notes: notes.trim() })
  }

  return (
    <Modal
      title="Разход за гориво"
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
      {remaining != null ? (
        <p className="field__hint" style={{ marginBottom: 12 }}>
          Оставаща сума за гориво: <strong>{formatEuro(remaining)}</strong>
        </p>
      ) : null}
      <label className="field">
        <span className="field__label">Сума (€)</span>
        <input
          className="input"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          placeholder="напр. 35.00"
          autoFocus
        />
      </label>
      <label className="field">
        <span className="field__label">Бележка</span>
        <input
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="напр. Зареждане OMV (по избор)"
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
