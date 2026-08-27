import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge.jsx'
import { carTitle, carPhoto, isOwnCar, oilInfo } from '../utils/vehicles.js'

// Vehicle card for the fleet list (spec §24, §26). The registration plate is the
// most prominent element (spec §28).
export default function VehicleCard({ car }) {
  const maintenance = car.status === 'maintenance'
  const own = isOwnCar(car)
  const photo = carPhoto(car)
  const oilDue = !own && oilInfo(car).due
  return (
    <Link to={`/vehicles/${car.car_id}`} className="vehicle-card">
      <div className="vehicle-card__media">
        {photo ? (
          <img src={photo} alt={carTitle(car)} loading="lazy" />
        ) : (
          <span className="vehicle-card__noimg" aria-hidden="true">{own ? '🔑' : '🚗'}</span>
        )}
        {maintenance ? (
          <span className="vehicle-card__warn" title="Активен проблем">⚠</span>
        ) : null}
      </div>

      <div className="vehicle-card__body">
        <div className="vehicle-card__plate">{car.registration}</div>
        <div className="vehicle-card__name">{own ? 'по-високо заплащане' : carTitle(car)}</div>

        <div className="vehicle-card__status">
          <StatusBadge status={car.status} />
          {oilDue ? <span className="oil-badge" title="Нужна е смяна на масло">🛢 Масло</span> : null}
        </div>

        {car.status === 'in_use' && car.current_driver_name ? (
          <div className="vehicle-card__meta">👤 <span className="who-name">{car.current_driver_name}</span></div>
        ) : car.status === 'available' && car.parked_location ? (
          <div className="vehicle-card__meta">📍 {car.parked_location}</div>
        ) : car.status === 'maintenance' && car.notes ? (
          <div className="vehicle-card__meta vehicle-card__meta--danger">{car.notes}</div>
        ) : null}
      </div>
    </Link>
  )
}
