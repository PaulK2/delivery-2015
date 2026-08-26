import { useState } from 'react'
import Modal from './Modal.jsx'
import { DOC_TYPE, DOC_TYPE_ORDER } from '../utils/documents.js'
import { CONFIG } from '../config/index.js'

// Add or edit a vehicle document (spec §50). `doc` is an existing row (snake_case)
// when editing, or null when creating.
export default function DocumentModal({ carId, doc, onClose, onSubmit, submitting }) {
  const [type, setType] = useState(doc?.type || 'inspection')
  const [provider, setProvider] = useState(doc?.provider || '')
  const [documentNumber, setDocumentNumber] = useState(doc?.document_number || '')
  const [validFrom, setValidFrom] = useState(doc?.valid_from || '')
  const [validUntil, setValidUntil] = useState(doc?.valid_until || '')
  const [warningDays, setWarningDays] = useState(
    doc?.warning_days || String(CONFIG.documentWarningDays)
  )
  const [notes, setNotes] = useState(doc?.notes || '')
  const [error, setError] = useState('')

  function submit() {
    if (!validUntil) {
      setError('Въведете дата „валиден до“.')
      return
    }
    onSubmit({
      document_id: doc?.document_id,
      carId,
      type,
      provider: provider.trim(),
      documentNumber: documentNumber.trim(),
      validFrom,
      validUntil,
      warningDays: Number(warningDays) || CONFIG.documentWarningDays,
      notes: notes.trim(),
    })
  }

  return (
    <Modal
      title={doc ? 'Редактиране на документ' : 'Нов документ'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Отказ
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Записване…' : 'Запази'}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Тип</span>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {DOC_TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {DOC_TYPE[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">Доставчик / институция</span>
        <input
          className="input"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="по избор"
        />
      </label>

      <label className="field">
        <span className="field__label">Номер на документа</span>
        <input
          className="input"
          value={documentNumber}
          onChange={(e) => setDocumentNumber(e.target.value)}
          placeholder="по избор"
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field__label">Валиден от</span>
          <input
            className="input"
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Валиден до</span>
          <input
            className="input"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span className="field__label">Предупреждение преди (дни)</span>
        <input
          className="input"
          type="number"
          min="1"
          value={warningDays}
          onChange={(e) => setWarningDays(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="field__label">Бележка</span>
        <textarea
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="по избор"
        />
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
