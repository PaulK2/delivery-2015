import { useEffect, useState } from 'react'
import { getLocations, saveLocation } from '../../services/locations/locations.js'
import { useToast } from '../../context/ToastContext.jsx'
import Spinner from '../Spinner.jsx'
import LocationModal from './LocationModal.jsx'

export default function AdminLocations() {
  const { showToast } = useToast()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(undefined)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      setList(await getLocations({ includeInactive: true }))
    } catch (e) {
      setError(e.message || 'Грешка при зареждане.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function onSave(loc) {
    setBusy(true)
    try {
      await saveLocation(loc)
      setEditing(undefined)
      showToast('Локацията е записана.', 'success')
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
        <span className="admin-toolbar__count">{list.length} локации</span>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing(null)}>
          + Нова локация
        </button>
      </div>

      <ul className="admin-list">
        {list.map((l) => (
          <li key={l.location_id} className="admin-row">
            <div className="admin-row__main">
              <span className="admin-row__name">
                {l.name}
                {!l.active ? <span className="tag tag--muted">Неактивна</span> : null}
              </span>
              <span className="admin-row__sub">
                {l.address || '—'}
                {l.latitude != null ? ` · ${l.latitude.toFixed(4)}, ${l.longitude.toFixed(4)}` : ' · без координати'}
              </span>
            </div>
            <div className="admin-row__actions">
              <button className="btn btn--ghost btn--sm" onClick={() => setEditing(l)}>
                Редактирай
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing !== undefined ? (
        <LocationModal location={editing} onClose={() => setEditing(undefined)} onSubmit={onSave} submitting={busy} />
      ) : null}
    </div>
  )
}
