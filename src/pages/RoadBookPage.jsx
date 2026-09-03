import { useEffect, useMemo, useState } from 'react'
import { getRoadBook, exportRoadBookExcel } from '../services/roadbook/roadbook.js'
import { getAllCars } from '../services/fleet/fleet.js'
import { todayISO, mondayOfWeekISO, formatStampBG, stampTime, weekRangeLabel } from '../utils/datetime.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import PeriodNav from '../components/PeriodNav.jsx'
import Spinner from '../components/Spinner.jsx'
import RoadBookExportArchive from '../components/RoadBookExportArchive.jsx'

// Groups flat usage entries by registration plate (accordion sections), each sorted
// newest-first inside — matches the spec's example layout exactly.
function groupByCar(entries) {
  const map = new Map()
  for (const e of entries) {
    if (!map.has(e.registration)) map.set(e.registration, [])
    map.get(e.registration).push(e)
  }
  for (const list of map.values()) list.sort((a, b) => b.start_at.localeCompare(a.start_at))
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'bg'))
}

export default function RoadBookPage() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()

  const [weekStart, setWeekStart] = useState(() => mondayOfWeekISO(todayISO()))
  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [carFilter, setCarFilter] = useState('')
  const [cars, setCars] = useState([])

  const [entries, setEntries] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openCars, setOpenCars] = useState(() => new Set())

  const [exportWeekStart, setExportWeekStart] = useState(() => mondayOfWeekISO(todayISO()))
  const [exporting, setExporting] = useState(false)

  const usingCustomRange = customOpen && customFrom && customTo

  useEffect(() => {
    if (!isAdmin) return
    getAllCars()
      .then(setCars)
      .catch(() => {})
  }, [isAdmin])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const params = usingCustomRange
        ? { dateFrom: customFrom, dateTo: customTo, carId: carFilter || undefined }
        : { weekStart, carId: carFilter || undefined }
      const res = await getRoadBook(params)
      setEntries(res.entries)
      setHasMore(res.hasMore)
    } catch (e) {
      setError(e.message || 'Грешка при зареждане.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (!isAdmin) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, weekStart, usingCustomRange, customFrom, customTo, carFilter])

  const grouped = useMemo(() => groupByCar(entries), [entries])

  function toggleCar(reg) {
    setOpenCars((prev) => {
      const next = new Set(prev)
      next.has(reg) ? next.delete(reg) : next.add(reg)
      return next
    })
  }

  async function onExport() {
    setExporting(true)
    try {
      await exportRoadBookExcel(exportWeekStart)
      showToast('Файлът е изтеглен.', 'success')
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setExporting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <h1 className="page__title">Пътен лист</h1>
        <div className="empty-state">Нямате достъп до този раздел.</div>
      </div>
    )
  }

  return (
    <div className="page roadbook-page">
      <div className="page__header">
        <h1 className="page__title">Пътен лист</h1>
      </div>
      <p className="admin-hint">
        Постоянна история на движението на автомобилите — никога не се изтрива в края
        на седмицата. Седмицата/периодът тук са само филтър за преглед и Excel износ.
      </p>

      <div className="roadbook-filters">
        {!customOpen ? (
          <PeriodNav mode="week" value={weekStart} onChange={setWeekStart} />
        ) : (
          <div className="roadbook-custom-range">
            <label className="field">
              <span className="field__label">От дата</span>
              <input className="input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">До дата</span>
              <input className="input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setCustomOpen((o) => !o)}
        >
          {customOpen ? 'Обратно към седмица' : 'Персонализиран период'}
        </button>

        <select className="input input--sm" value={carFilter} onChange={(e) => setCarFilter(e.target.value)}>
          <option value="">Всички автомобили</option>
          {cars.map((c) => (
            <option key={c.car_id} value={c.car_id}>
              {c.registration}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner label="Зареждане…" />
      ) : error ? (
        <div className="banner banner--error" role="alert">
          {error}
          <button className="btn btn--sm btn--ghost" onClick={load}>
            Опитай отново
          </button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="empty-state">Няма движение на автомобили за избрания период.</div>
      ) : (
        <>
          {hasMore ? (
            <div className="banner banner--warn">
              Показани са само първите записи за периода. Стеснете периода за пълен преглед.
            </div>
          ) : null}
          <div className="roadbook-list">
            {grouped.map(([registration, list]) => {
              const isOpen = openCars.has(registration)
              return (
                <section key={registration} className={'roadbook-car' + (isOpen ? ' roadbook-car--open' : '')}>
                  <button
                    type="button"
                    className="roadbook-car__head"
                    aria-expanded={isOpen}
                    onClick={() => toggleCar(registration)}
                  >
                    <span className={'roadbook-car__chevron' + (isOpen ? ' roadbook-car__chevron--open' : '')} aria-hidden="true">
                      ▸
                    </span>
                    <span className="roadbook-car__plate">{registration}</span>
                    <span className="roadbook-car__count">{list.length}</span>
                  </button>

                  {isOpen ? (
                    <ul className="roadbook-entries">
                      {list.map((e) => (
                        <li key={e.usage_id} className="roadbook-entry">
                          <div className="roadbook-entry__date">{formatStampBG(e.start_at).split(' ')[0]}</div>
                          <div className="roadbook-entry__driver">{e.employee_name || '—'}</div>
                          <div className="roadbook-entry__times">
                            <span>Взет: {stampTime(e.start_at)}</span>
                            {e.is_active ? (
                              <span className="roadbook-entry__active">Все още в движение</span>
                            ) : (
                              <span>
                                Освободен: {stampTime(e.effective_end_at)}
                                {e.end_inferred ? <span className="roadbook-entry__inferred" title="Изведено от следващото вземане — липсва запис за освобождаване">*</span> : null}
                              </span>
                            )}
                          </div>
                          {e.parked_location ? <div className="roadbook-entry__parked">📍 {e.parked_location}</div> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              )
            })}
          </div>
        </>
      )}

      <section className="detail-section roadbook-export">
        <h2 className="detail-section__title">Изтегляне на Excel</h2>
        <PeriodNav mode="week" value={exportWeekStart} onChange={setExportWeekStart} />
        <button className="btn btn--primary btn--block" onClick={onExport} disabled={exporting}>
          {exporting ? 'Генериране…' : `Изтегли Excel (${weekRangeLabel(exportWeekStart)})`}
        </button>
      </section>

      <RoadBookExportArchive />
    </div>
  )
}
