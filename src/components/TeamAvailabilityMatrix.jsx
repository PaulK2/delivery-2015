import { useMemo } from 'react'
import { weekdayNameByIndex, weekdayIndex } from '../utils/datetime.js'
import { SHIFT_BADGES } from '../utils/shifts.js'

// Team availability overview (spec §22). Employees × Mon–Sun with short badges.
export default function TeamAvailabilityMatrix({ employees, availability, dates }) {
  // Lookup: employee_id -> date -> shift_type
  const byEmp = useMemo(() => {
    const m = {}
    for (const r of availability) {
      ;(m[r.employee_id] ||= {})[String(r.date)] = r.shift_type
    }
    return m
  }, [availability])

  // Employees who submitted anything for this week come first.
  const rows = useMemo(() => {
    return [...employees].sort((a, b) => {
      const sa = byEmp[a.employee_id] ? 0 : 1
      const sb = byEmp[b.employee_id] ? 0 : 1
      return sa - sb || a.name.localeCompare(b.name, 'bg')
    })
  }, [employees, byEmp])

  if (employees.length === 0) {
    return <div className="empty-state empty-state--sm">Няма служители.</div>
  }

  return (
    <div className="matrix-scroll">
      <table className="matrix">
        <thead>
          <tr>
            <th className="matrix__name-h">Служител</th>
            {dates.map((d) => (
              <th key={d} className="matrix__day-h">
                {weekdayNameByIndex(weekdayIndex(d)).slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((emp) => {
            const days = byEmp[emp.employee_id]
            return (
              <tr key={emp.employee_id} className={days ? '' : 'matrix__row--missing'}>
                <td className="matrix__name">{emp.name}</td>
                {dates.map((d) => {
                  const st = days?.[d]
                  return (
                    <td key={d} className="matrix__cell">
                      {st === 'full' ? (
                        <span className="mini-badge mini-badge--full">{SHIFT_BADGES.full}</span>
                      ) : st === 'evening' ? (
                        <span className="mini-badge mini-badge--evening">{SHIFT_BADGES.evening}</span>
                      ) : (
                        <span className="mini-badge mini-badge--none">–</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
