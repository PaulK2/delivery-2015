import { useState } from 'react'
import Modal from './Modal.jsx'

// Release form (spec §32). Parking location + current odometer are required; note optional.
export default function ReleaseCarModal({ onClose, onSubmit, submitting, lastOdometer }) {
  const [parkedLocation, setParkedLocation] = useState('')
  const [odometer, setOdometer] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const prev = lastOdometer == null ? null : Number(lastOdometer)

  function submit() {
    if (!parkedLocation.trim()) {
      setError('Моля, въведете къде оставихте автомобила.')
      return
    }
    if (!/^\d+$/.test(odometer)) {
      setError('Въведете текущия километраж (в км).')
      return
    }
    const km = Number(odometer)
    if (prev != null && km < prev) {
      setError(`Километражът не може да е под предишния (${prev.toLocaleString('bg-BG')} км).`)
      return
    }
    onSubmit(parkedLocation.trim(), notes.trim(), km)
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
        <span className="field__label">Текущ километраж (км)</span>
        <input
          className="input"
          inputMode="numeric"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))}
          placeholder={prev != null ? `≥ ${prev.toLocaleString('bg-BG')}` : 'напр. 145000'}
        />
        {prev != null ? (
          <span className="field__hint">Последно записан: {prev.toLocaleString('bg-BG')} км</span>
        ) : null}
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
