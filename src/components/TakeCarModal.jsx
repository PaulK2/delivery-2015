import { useState } from 'react'
import Modal from './Modal.jsx'
import { SAFETY_EQUIPMENT } from '../config/index.js'

// Taking a car (§17, §22): the driver enters how much fuel money is in the vehicle
// documents (required — it becomes the session's starting balance) and confirms the
// safety equipment. Missing equipment doesn't block taking the car; it's recorded.
export default function TakeCarModal({ onClose, onSubmit, submitting }) {
  const [fuelCash, setFuelCash] = useState('')
  // Default every item to checked ("present"); the driver unchecks anything missing.
  const [equipment, setEquipment] = useState(() =>
    Object.fromEntries(SAFETY_EQUIPMENT.map((it) => [it.key, true]))
  )
  const [error, setError] = useState('')

  const toggle = (key) => setEquipment((e) => ({ ...e, [key]: !e[key] }))

  const missing = SAFETY_EQUIPMENT.filter((it) => !equipment[it.key])

  function submit() {
    const value = fuelCash.replace(',', '.')
    if (!/^\d+(\.\d+)?$/.test(value) || Number(value) < 0) {
      setError('Въведете наличните пари за гориво (в €).')
      return
    }
    onSubmit({ fuelCashStart: Number(value), equipment })
  }

  return (
    <Modal
      title="Вземане на автомобил"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Отказ
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Обработва се…' : 'Вземи автомобила'}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Налични пари за гориво в документите (€)</span>
        <input
          className="input"
          inputMode="decimal"
          value={fuelCash}
          onChange={(e) => setFuelCash(e.target.value.replace(/[^\d.,]/g, ''))}
          placeholder="напр. 80.00"
          autoFocus
        />
        <span className="field__hint">
          Това е началният баланс за гориво за текущото каране.
        </span>
      </label>

      <div className="field">
        <span className="field__label">Оборудване в автомобила</span>
        <div className="equip-check">
          {SAFETY_EQUIPMENT.map((it) => (
            <label key={it.key} className="equip-check__item">
              <input
                type="checkbox"
                checked={!!equipment[it.key]}
                onChange={() => toggle(it.key)}
              />
              <span>{it.label}</span>
            </label>
          ))}
        </div>
        {missing.length ? (
          <p className="banner banner--warn" role="status">
            Липсва оборудване: {missing.map((m) => m.label).join(', ')}. Може да продължите —
            липсата ще бъде записана.
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
