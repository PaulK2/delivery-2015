import { useState } from 'react'
import Modal from './Modal.jsx'
import { CATEGORY_ORDER, MAINTENANCE_CATEGORY, SEVERITY, SEVERITY_ORDER } from '../utils/vehicles.js'

// Report a maintenance issue (spec §37–§39). Reporter + timestamp are set by the
// backend. (No image field — the backend does not store one.)
export default function ReportIssueModal({ onClose, onSubmit, submitting }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('other')
  const [severity, setSeverity] = useState('low')
  const [error, setError] = useState('')

  function submit() {
    if (!title.trim()) {
      setError('Моля, въведете заглавие на проблема.')
      return
    }
    onSubmit({ title: title.trim(), description: description.trim(), category, severity })
  }

  return (
    <Modal
      title="Докладвай проблем"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Отказ
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Изпращане…' : 'Докладвай'}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Заглавие</span>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="напр. Шум от предна дясна гума"
          autoFocus
        />
      </label>

      <label className="field">
        <span className="field__label">Описание</span>
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="по избор"
        />
      </label>

      <label className="field">
        <span className="field__label">Категория</span>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {MAINTENANCE_CATEGORY[c]}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span className="field__label">Сериозност</span>
        <div className="segmented" role="group" aria-label="Сериозност">
          {SEVERITY_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className={
                'segmented__btn sev-seg sev-seg--' + SEVERITY[s].cls + (severity === s ? ' is-active' : '')
              }
              aria-pressed={severity === s}
              onClick={() => setSeverity(s)}
            >
              {SEVERITY[s].label}
            </button>
          ))}
        </div>
        <p className="field__hint">{SEVERITY[severity].hint}</p>
      </div>

      {severity === 'critical' ? (
        <div className="banner banner--error">
          Критичен проблем ще направи автомобила недостъпен, докато не бъде отстранен.
        </div>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
