import { useState } from 'react'
import Modal from './Modal.jsx'
import { categoryLabel, SEVERITY } from '../utils/vehicles.js'

// Resolve a maintenance issue — admin (spec §43). The resolution date is recorded
// automatically by the backend (resolved_at).
export default function ResolveIssueModal({ issue, onClose, onSubmit, submitting }) {
  const [repairDescription, setRepairDescription] = useState('')
  const [service, setService] = useState('')
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function submit() {
    if (!repairDescription.trim()) {
      setError('Опишете какво е ремонтирано.')
      return
    }
    onSubmit({
      maintenanceId: issue.maintenance_id,
      repairDescription: repairDescription.trim(),
      service: service.trim(),
      cost: cost.trim(),
      notes: notes.trim(),
    })
  }

  return (
    <Modal
      title="Отстраняване на проблем"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Отказ
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Записване…' : 'Маркирай като отстранен'}
          </button>
        </>
      }
    >
      <div className="resolve-issue__ref">
        <strong>{issue.title}</strong>
        <span className="resolve-issue__cat">
          {categoryLabel(issue.category)} · {SEVERITY[issue.severity]?.label || issue.severity}
        </span>
      </div>

      <label className="field">
        <span className="field__label">Какво беше ремонтирано?</span>
        <textarea
          className="input"
          rows={3}
          value={repairDescription}
          onChange={(e) => setRepairDescription(e.target.value)}
          autoFocus
        />
      </label>

      <label className="field">
        <span className="field__label">Сервиз</span>
        <input
          className="input"
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="по избор"
        />
      </label>

      <label className="field">
        <span className="field__label">Цена</span>
        <input
          className="input"
          inputMode="decimal"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="по избор, напр. 120"
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
