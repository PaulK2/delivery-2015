import { useState } from 'react'
import Modal from '../Modal.jsx'

// Add / edit a work location (spec §74).
export default function LocationModal({ location, onClose, onSubmit, submitting }) {
  const isNew = !location
  const [f, setF] = useState({
    name: location?.name || '',
    address: location?.address || '',
    latitude: location?.latitude ?? '',
    longitude: location?.longitude ?? '',
    active: location ? location.active : true,
  })
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  function submit() {
    if (!f.name.trim()) return setError('Въведете име на локацията.')
    onSubmit({
      location_id: location?.location_id,
      name: f.name.trim(),
      address: f.address.trim(),
      latitude: f.latitude === '' ? null : Number(f.latitude),
      longitude: f.longitude === '' ? null : Number(f.longitude),
      active: f.active,
    })
  }

  return (
    <Modal
      title={isNew ? 'Нова локация' : 'Редактиране на локация'}
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
        <input className="input" value={f.name} onChange={set('name')} autoFocus />
      </label>
      <label className="field">
        <span className="field__label">Адрес</span>
        <input className="input" value={f.address} onChange={set('address')} placeholder="по избор" />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field__label">Ширина (lat)</span>
          <input className="input" inputMode="decimal" value={f.latitude} onChange={set('latitude')} />
        </label>
        <label className="field">
          <span className="field__label">Дължина (lng)</span>
          <input className="input" inputMode="decimal" value={f.longitude} onChange={set('longitude')} />
        </label>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={f.active}
          onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))}
        />
        <span>Активна</span>
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
