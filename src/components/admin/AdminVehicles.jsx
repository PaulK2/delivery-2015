import { useEffect, useMemo, useState } from 'react'
import { getAllCars, saveCar } from '../../services/fleet/fleet.js'
import { useToast } from '../../context/ToastContext.jsx'
import { carTitle } from '../../utils/vehicles.js'
import StatusBadge from '../StatusBadge.jsx'
import Spinner from '../Spinner.jsx'
import VehicleModal from './VehicleModal.jsx'

export default function AdminVehicles() {
  const { showToast } = useToast()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(undefined)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      setList(await getAllCars())
    } catch (e) {
      setError(e.message || 'Грешка при зареждане.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const n = q.replace(/\s+/g, '').toLowerCase()
    const arr = list || []
    return n
      ? arr.filter(
          (c) => c.registration.replace(/\s+/g, '').toLowerCase().includes(n) || carTitle(c).toLowerCase().includes(n)
        )
      : arr
  }, [list, q])

  async function onSave(car) {
    setBusy(true)
    try {
      await saveCar(car)
      setEditing(undefined)
      showToast('Автомобилът е записан.', 'success')
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
          placeholder="Рег. номер или марка…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn--primary btn--sm" onClick={() => setEditing(null)}>
          + Нов автомобил
        </button>
      </div>

      <ul className="admin-list">
        {filtered.map((c) => (
          <li key={c.car_id} className="admin-row">
            <div className="admin-row__main">
              <span className="admin-row__name">{c.registration}</span>
              <span className="admin-row__sub">
                {carTitle(c)}
                {!c.active ? <span className="tag tag--muted">Неактивен</span> : null}
              </span>
            </div>
            <div className="admin-row__actions">
              <StatusBadge status={c.status} />
              <button className="btn btn--ghost btn--sm" onClick={() => setEditing(c)}>
                Редактирай
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing !== undefined ? (
        <VehicleModal car={editing} onClose={() => setEditing(undefined)} onSubmit={onSave} submitting={busy} />
      ) : null}
    </div>
  )
}
