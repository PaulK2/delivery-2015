import { useEffect, useMemo, useState } from 'react'
import { getRoadBookExportArchive, exportRoadBookExcel, downloadRoadBookExport } from '../services/roadbook/roadbook.js'
import { todayISO, mondayOfWeekISO, shiftISO, weekRangeLabel, formatStampBG } from '../utils/datetime.js'
import { useToast } from '../context/ToastContext.jsx'
import Spinner from './Spinner.jsx'

const RECENT_WEEKS = 12

// The last N Mondays (including the current week), most recent first — shown even if
// never generated yet, so "Не е генериран" is visible (spec §16), not just a sparse
// list of what already happens to exist.
function recentMondays(n) {
  const thisMonday = mondayOfWeekISO(todayISO())
  const out = []
  for (let i = 0; i < n; i++) out.push(shiftISO(thisMonday, -7 * i))
  return out
}

export default function RoadBookExportArchive() {
  const { showToast } = useToast()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [busyWeek, setBusyWeek] = useState('') // week_start currently generating/downloading, or ''

  async function load() {
    setError('')
    try {
      setList(await getRoadBookExportArchive())
    } catch (e) {
      setError(e.message || 'Грешка при зареждане.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  const rows = useMemo(() => {
    const byWeek = new Map((list || []).map((e) => [e.week_start, e]))
    return recentMondays(RECENT_WEEKS).map((weekStart) => byWeek.get(weekStart) || { week_start: weekStart, status: 'missing' })
  }, [list])

  async function onGenerate(weekStart) {
    setBusyWeek(weekStart)
    try {
      await exportRoadBookExcel(weekStart)
      showToast('Файлът е генериран и изтеглен.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusyWeek('')
    }
  }

  async function onDownload(weekStart) {
    setBusyWeek(weekStart)
    try {
      await downloadRoadBookExport(weekStart)
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusyWeek('')
    }
  }

  if (list === null) return error ? <div className="banner banner--error">{error}</div> : <Spinner label="Зареждане…" />

  return (
    <section className="detail-section roadbook-archive">
      <h2 className="detail-section__title">Архив на експорти</h2>
      <ul className="roadbook-archive-list">
        {rows.map((row) => {
          const weekEnd = shiftISO(row.week_start, 6)
          const busy = busyWeek === row.week_start
          return (
            <li key={row.week_start} className="roadbook-archive-row">
              <div className="roadbook-archive-row__main">
                <span className="roadbook-archive-row__period">{weekRangeLabel(row.week_start)}</span>
                {row.status === 'ready' ? (
                  <>
                    <span className="tag tag--ok">Готов</span>
                    <span className="roadbook-archive-row__meta">Генериран: {formatStampBG(row.generated_at)}</span>
                  </>
                ) : row.status === 'error' ? (
                  <>
                    <span className="tag tag--warn">Грешка при генериране</span>
                    {row.error_message ? <span className="roadbook-archive-row__meta">{row.error_message}</span> : null}
                  </>
                ) : (
                  <span className="tag tag--muted">Не е генериран</span>
                )}
              </div>
              <div className="roadbook-archive-row__actions">
                {row.status === 'ready' ? (
                  <button className="btn btn--ghost btn--sm" onClick={() => onDownload(row.week_start)} disabled={busy}>
                    {busy ? '…' : 'Изтегли'}
                  </button>
                ) : null}
                <button className="btn btn--ghost btn--sm" onClick={() => onGenerate(row.week_start)} disabled={busy}>
                  {busy ? '…' : row.status === 'ready' ? 'Генерирай отново' : 'Генерирай'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
