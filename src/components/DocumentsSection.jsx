import { useMemo } from 'react'
import { docTypeLabel, computeDocStatus } from '../utils/documents.js'
import { formatDateBG } from '../utils/datetime.js'

const DOT = { valid: '🟢', soon: '🟡', expired: '🔴', none: '⚪' }

// Vehicle documents & deadlines (spec §46–§50). Sorted by nearest expiry.
export default function DocumentsSection({ documents, isAdmin, onAdd, onEdit }) {
  const rows = useMemo(() => {
    return documents
      .map((d) => ({ doc: d, st: computeDocStatus(d.valid_until, d.warning_days) }))
      .sort((a, b) => {
        const av = a.st.days == null ? Infinity : a.st.days
        const bv = b.st.days == null ? Infinity : b.st.days
        return av - bv
      })
  }, [documents])

  return (
    <section className="detail-section">
      <div className="detail-section__head">
        <h2 className="detail-section__title">Документи и срокове</h2>
        {isAdmin ? (
          <button className="btn btn--ghost btn--sm" onClick={onAdd}>
            + Добави
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state empty-state--sm">Няма добавени документи.</div>
      ) : (
        <ul className="doc-list">
          {rows.map(({ doc, st }) => (
            <li key={doc.document_id} className={'doc-item doc-item--' + st.cls}>
              <div className="doc-item__main">
                <div className="doc-item__type">{docTypeLabel(doc.type)}</div>
                <div className="doc-item__sub">
                  {doc.provider ? <span>{doc.provider}</span> : null}
                  {doc.document_number ? <span>№ {doc.document_number}</span> : null}
                  {doc.valid_until ? <span>до {formatDateBG(doc.valid_until)}</span> : null}
                </div>
                {doc.notes ? <div className="doc-item__notes">{doc.notes}</div> : null}
              </div>
              <div className="doc-item__side">
                <span className={'doc-badge doc-badge--' + st.cls}>
                  <span aria-hidden="true">{DOT[st.state]}</span> {st.label || '—'}
                </span>
                {isAdmin ? (
                  <button className="doc-item__edit" onClick={() => onEdit(doc)} aria-label="Редактирай">
                    ✎
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
