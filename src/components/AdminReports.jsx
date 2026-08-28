import { useEffect, useMemo, useState } from 'react'
import { todayISO } from '../utils/datetime.js'
import { formatEuro } from '../utils/shifts.js'
import { deliveryTypesForRestaurant, DELIVERY_TYPES, locationOrderRank } from '../config/index.js'
import { getReportsForDate } from '../services/reports/reports.js'
import PeriodNav from './PeriodNav.jsx'
import Spinner from './Spinner.jsx'

// Admin overview of everyone's daily reports for a chosen day, grouped restaurant →
// worker, with per-worker rows expandable to each individual receipt value.
export default function AdminReports() {
  const [date, setDate] = useState(() => todayISO())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(() => new Set())

  const toggle = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  async function load() {
    setLoading(true)
    try {
      setRows(await getReportsForDate(date, { force: true }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      if (!map.has(r.restaurant)) map.set(r.restaurant, { workers: new Map(), totals: {} })
      const g = map.get(r.restaurant)
      const id = String(r.employee_id)
      if (!g.workers.has(id))
        g.workers.set(id, { employee_id: id, name: r.employee_name, cats: {}, deliveries: [] })
      const w = g.workers.get(id)
      if (!w.cats[r.delivery_type]) w.cats[r.delivery_type] = { count: 0, sum: 0 }
      w.cats[r.delivery_type].count += 1
      w.cats[r.delivery_type].sum += r.amount
      w.deliveries.push(r)
      if (!g.totals[r.delivery_type]) g.totals[r.delivery_type] = { count: 0, sum: 0 }
      g.totals[r.delivery_type].count += 1
      g.totals[r.delivery_type].sum += r.amount
    }
    return [...map.entries()]
      .sort((a, b) => locationOrderRank(a[0]) - locationOrderRank(b[0]) || a[0].localeCompare(b[0], 'bg'))
      .map(([restaurant, g]) => ({
        restaurant,
        workers: [...g.workers.values()].sort((a, b) => a.name.localeCompare(b.name, 'bg')),
        totals: g.totals,
      }))
  }, [rows])

  return (
    <div>
      <PeriodNav mode="day" value={date} onChange={setDate} />

      {loading ? (
        <Spinner label="Зареждане…" />
      ) : grouped.length === 0 ? (
        <div className="empty-state">Няма отчети за избрания ден.</div>
      ) : (
        <div className="report-groups">
          {grouped.map((g) => (
            <section key={g.restaurant} className="report-group">
              <h2 className="report-group__title">{g.restaurant}</h2>

              <div className="report-acc-list">
                {g.workers.map((w) => {
                  const cats = Object.values(w.cats)
                  const count = cats.reduce((a, c) => a + c.count, 0)
                  const sum = cats.reduce((a, c) => a + c.sum, 0)
                  const key = g.restaurant + '|' + w.employee_id
                  const isOpen = expanded.has(key)
                  return (
                    <div key={w.employee_id} className={'report-acc' + (isOpen ? ' report-acc--open' : '')}>
                      <button className="report-acc__head" onClick={() => toggle(key)} aria-expanded={isOpen}>
                        <span className="report-acc__chev" aria-hidden="true">
                          {isOpen ? '▾' : '▸'}
                        </span>
                        <span className="report-acc__name">{w.name}</span>
                        <span className="report-worker__total">
                          {count} бр. · {formatEuro(sum)}
                        </span>
                      </button>

                      {isOpen ? (
                        <div className="report-acc__body">
                          {deliveryTypesForRestaurant(g.restaurant)
                            .filter((t) => w.cats[t.key])
                            .map((t) => {
                              const cat = w.cats[t.key]
                              const items = w.deliveries.filter((d) => d.delivery_type === t.key)
                              return (
                                <div key={t.key} className="report-cat-detail">
                                  <div className="report-row report-row--sm">
                                    <span className="report-row__label">{t.label}</span>
                                    <span className="report-row__input">
                                      {cat.count} бр. · {formatEuro(cat.sum)}
                                    </span>
                                  </div>
                                  <div className="report-cat-detail__items">
                                    {items.map((d) => (
                                      <span key={d.report_id} className="report-chip">
                                        {formatEuro(d.amount)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          <div className="report-row report-row--total">
                            <span className="report-row__label">Общо</span>
                            <span className="report-row__input">
                              {count} бр. · {formatEuro(sum)}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <div className="report-totals">
                <div className="report-totals__title">Общо за деня</div>
                {DELIVERY_TYPES.filter((t) => g.totals[t.key] != null).map((t) => (
                  <div key={t.key} className="report-row report-row--sm">
                    <span className="report-row__label">{t.label}</span>
                    <span className="report-row__input">
                      {g.totals[t.key].count} бр. · {formatEuro(g.totals[t.key].sum)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
