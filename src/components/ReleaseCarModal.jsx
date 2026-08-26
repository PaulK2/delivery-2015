import { useState } from 'react'
import Modal from './Modal.jsx'

// Release form (spec §32). Parking location is required; note is optional.
export default function ReleaseCarModal({ onClose, onSubmit, submitting }) {
  const [parkedLocation, setParkedLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function submit() {
    if (!parkedLocation.trim()) {
      setError('Моля, въведете къде оставихте автомобила.')
      return
    }
    onSubmit(parkedLocation.trim(), notes.trim())
  }

  return (
    <Modal
      title="Освобождаване на автомобил"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Отказ
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Записване…' : 'Освободи'}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Къде оставихте автомобила?</span>
        <input
          className="input"
          value={parkedLocation}
          onChange={(e) => setParkedLocation(e.target.value)}
          placeholder="напр. Централен паркинг"
          autoFocus
        />
      </label>
      <label className="field">
        <span className="field__label">Допълнителна бележка</span>
        <textarea
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="по избор"
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
