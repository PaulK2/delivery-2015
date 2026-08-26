import { carStatus } from '../utils/vehicles.js'

// Vehicle status pill (spec §25, §26). Uses icon + text so status is never
// conveyed by color alone (spec §88).
export default function StatusBadge({ status }) {
  const s = carStatus(status)
  return (
    <span className={'status-badge status-badge--' + s.cls}>
      <span aria-hidden="true">{s.dot}</span>
      {s.label}
    </span>
  )
}
