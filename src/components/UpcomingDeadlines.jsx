import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllDocuments } from '../services/documents/documents.js'
import { docTypeLabel, computeDocStatus } from '../utils/documents.js'
import Spinner from './Spinner.jsx'

// Admin widget: documents nearest to expiry across the fleet (spec §71).
export default function UpcomingDeadlines() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getAllDocuments()
      .then((docs) => {
        if (!alive) return
        const scored = docs
          .map((d) => ({ doc: d, st: computeDocStatus(d.valid_until, d.warning_days) }))
          .filter((r) => r.st.state === 'soon' || r.st.state === 'expired')
          .sort((a, b) => (a.st.days ?? 0) - (b.st.days ?? 0))
          .slice(0, 8)
        setRows(scored)
      })
      .catch((e) => alive && setError(e.message || 'Грешка при зареждане.'))
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="deadlines">
      <h2 className="deadlines__title">Предстоящи срокове</h2>
      {rows === null ? (
        error ? (
          <div className="empty-state empty-state--sm">{error}</div>
        ) : (
          <Spinner label="Зареждане…" />
        )
      ) : rows.length === 0 ? (
        <div className="empty-state empty-state--sm">Няма изтичащи документи.</div>
      ) : (
        <ul className="deadlines__list">
          {rows.map(({ doc, st }) => (
            <li key={doc.document_id} className="deadline">
              <Link to={`/vehicles/${doc.car_id}`} className="deadline__plate">
                {doc.registration}
              </Link>
              <span className="deadline__type">{docTypeLabel(doc.type)}</span>
              <span className={'deadline__days deadline__days--' + st.cls}>{st.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
