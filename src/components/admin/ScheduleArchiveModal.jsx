import { useState } from 'react'
import Modal from '../Modal.jsx'

// Add / edit an archived schedule sheet link (a past week's график, kept for reference).
export default function ScheduleArchiveModal({ link, onClose, onSubmit, submitting }) {
  const isNew = !link
  const [f, setF] = useState({
    label: link?.label || '',
    url: link?.url || '',
  })
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  function validUrl(u) {
    return /docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(u)
  }

  function submit() {
    if (!f.label.trim()) return setError('Въведете описание (напр. коя седмица е).')
    if (!validUrl(f.url)) return setError('Невалидна Google Sheets връзка.')
    onSubmit({
      archive_id: link?.archive_id,
      label: f.label.trim(),
      url: f.url.trim(),
    })
  }

  return (
    <Modal
      title={isNew ? 'Нова архивна връзка' : 'Редактиране на връзка'}
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
        <span className="field__label">Описание</span>
        <input
          className="input"
          value={f.label}
          onChange={set('label')}
          placeholder="напр. 18–24 август"
          autoFocus
        />
      </label>
      <label className="field">
        <span className="field__label">Google Sheet връзка</span>
        <input
          className="input"
          type="url"
          value={f.url}
          onChange={set('url')}
          placeholder="https://docs.google.com/spreadsheets/d/..."
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
