import { useEffect, useMemo, useState } from 'react'
import { getCars } from '../services/fleet/fleet.js'
import { CONFIG } from '../config/index.js'
import { carTitle } from '../utils/vehicles.js'
import VehicleCard from '../components/VehicleCard.jsx'
import Spinner from '../components/Spinner.jsx'

const norm = (s) => (s || '').toString().toLowerCase().replace(/\s+/g, '')

export default function VehiclesPage() {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true)
    setError('')
    try {
      setCars(await getCars())
    } catch (e) {
      setError(e.message || 'Автомобилите не могат да бъдат заредени.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(true)
    const id = setInterval(() => load(false), CONFIG.autoRefreshMs)
    const onFocus = () => load(false)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // Search works on partial registration plate (spec §75) and make/model.
  const filtered = useMemo(() => {
    const needle = norm(q)
    if (!needle) return cars
    return cars.filter(
      (c) => norm(c.registration).includes(needle) || norm(carTitle(c)).includes(needle)
    )
  }, [cars, q])

  const counts = useMemo(() => {
    const c = { available: 0, in_use: 0, maintenance: 0, inactive: 0 }
    for (const car of cars) c[car.status] = (c[car.status] || 0) + 1
    return c
  }, [cars])

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Автомобили</h1>
        <button className="btn btn--ghost btn--sm" onClick={() => load(true)}>
          ↻ Обнови
        </button>
      </div>

      {!loading && cars.length > 0 ? (
        <div className="fleet-summary">
          <span className="fleet-summary__item">🟢 {counts.available} свободни</span>
          <span className="fleet-summary__item">🟠 {counts.in_use} в движение</span>
          {counts.maintenance ? (
            <span className="fleet-summary__item">🔴 {counts.maintenance} недостъпни</span>
          ) : null}
        </div>
      ) : null}

      <input
        className="input"
        type="search"
        placeholder="Търсене по регистрационен номер…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Търсене на автомобил"
      />

      {loading ? (
        <Spinner label="Зареждане на автомобилите…" />
      ) : error ? (
        <div className="banner banner--error" role="alert">
          {error}
          <button className="btn btn--sm btn--ghost" onClick={() => load(true)}>
            Опитай отново
          </button>
        </div>
      ) : cars.length === 0 ? (
        <div className="empty-state">Няма добавени автомобили.</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">Няма автомобили за „{q}“.</div>
      ) : (
        <div className="vehicle-grid">
          {filtered.map((car) => (
            <VehicleCard key={car.car_id} car={car} />
          ))}
        </div>
      )}
    </div>
  )
}
