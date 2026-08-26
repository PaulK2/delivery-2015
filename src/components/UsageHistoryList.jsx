import { useMemo, useState } from 'react'
import { formatStampBG, stampTime, stampDateISO, shiftISO, todayISO } from '../utils/datetime.js'

// Usage history with period presets and a driver filter (spec §34–§36).
const PRESETS = [
  { key: '7', label: 'Последни 7 дни', days: 7 },
  { key: '30', label: 'Последни 30 дни', days: 30 },
  { key: '90', label: 'Последни 3 месеца', days: 90 },
  { key: 'all', label: 'Цялата история', days: null },
]

export default function UsageHistoryList({ history }) {
  const [preset, setPreset] = useState('30')
  const [driver, setDriver] = useState('')

  const drivers = useMemo(
    () => [...new Set(history.map((h) => h.employee_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bg')),
    [history]
  )

  const filtered = useMemo(() => {
    const p = PRESETS.find((x) => x.key === preset)
    const cutoff = p?.days ? shiftISO(todayISO(), -p.days) : null
    return history.filter((h) => {
      if (driver && h.employee_name !== driver) return false
      if (cutoff && stampDateISO(h.start_at) < cutoff) return false
      return true
    })
  }, [history, preset, driver])

  return (
    <div className="usage">
      <div className="filters">
        <select className="input input--sm" value={preset} onChange={(e) => setPreset(e.target.value)}>
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        {drivers.length > 1 ? (
          <select className="input input--sm" value={driver} onChange={(e) => setDriver(e.target.value)}>
            <option value="">Всички шофьори</option>
            {drivers.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state empty-state--sm">Няма история за избрания период.</div>
      ) : (
        <ul className="usage-list">
          {filtered.map((h) => (
            <li key={h.usage_id} className="usage-item">
              <div className="usage-item__head">
                <span className="usage-item__driver">👤 {h.employee_name || '—'}</span>
                <span className="usage-item__date">{formatStampBG(h.start_at).split(' ')[0]}</span>
              </div>
              <div className="usage-item__times">
                <span>Взет: {stampTime(h.start_at) || '—'}</span>
                <span>Върнат: {h.end_at ? stampTime(h.end_at) : '⏳ в движение'}</span>
              </div>
              {h.parked_location ? (
                <div className="usage-item__parked">📍 {h.parked_location}</div>
              ) : null}
              {h.notes ? <div className="usage-item__notes">{h.notes}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
