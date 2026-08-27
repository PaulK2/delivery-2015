import { useState } from 'react'
import Modal from '../Modal.jsx'

// Add / edit a vehicle (spec §72). Image is a URL only — no base64 in Sheets (§29).
export default function VehicleModal({ car, onClose, onSubmit, submitting }) {
  const isNew = !car
  const [f, setF] = useState({
    registration: car?.registration || '',
    make: car?.make || '',
    model: car?.model || '',
    year: car?.year || '',
    image: car?.image || '',
    status: car?.status || 'available',
    notes: car?.notes || '',
    active: car ? car.active : true,
  })
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  function submit() {
    if (!f.registration.trim()) return setError('Въведете регистрационен номер.')
    onSubmit({ car_id: car?.car_id, ...f, registration: f.registration.trim() })
  }

  return (
    <Modal
      title={isNew ? 'Нов автомобил' : 'Редактиране на автомобил'}
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
        <span className="field__label">Регистрационен номер</span>
        <input className="input" value={f.registration} onChange={set('registration')} autoFocus />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field__label">Марка</span>
          <input className="input" value={f.make} onChange={set('make')} />
        </label>
        <label className="field">
          <span className="field__label">Модел</span>
          <input className="input" value={f.model} onChange={set('model')} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span className="field__label">Година</span>
          <input className="input" inputMode="numeric" value={f.year} onChange={set('year')} />
        </label>
        <label className="field">
          <span className="field__label">Статус</span>
          <select className="input" value={f.status} onChange={set('status')}>
            <option value="available">Свободен</option>
            <option value="maintenance">Недостъпен</option>
            <option value="inactive">Неактивен</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">URL на снимка</span>
        <input className="input" type="url" value={f.image} onChange={set('image')} placeholder="https://…" />
      </label>
      <label className="field">
        <span className="field__label">Бележка</span>
        <textarea className="input" rows={2} value={f.notes} onChange={set('notes')} />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={f.active}
          onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))}
        />
        <span>Активен (в автопарка)</span>
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
