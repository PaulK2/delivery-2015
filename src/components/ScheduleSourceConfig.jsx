import { useEffect, useState } from 'react'
import { getScheduleSource, setScheduleSource } from '../services/schedule/schedule.js'

// Admin field to configure the current schedule Google Sheet (spec §12).
export default function ScheduleSourceConfig({ onLoaded }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('') // '', 'saving', 'ok', 'error'
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getScheduleSource()
      .then((d) => setUrl(d?.url || ''))
      .catch(() => {})
  }, [])

  function validUrl(u) {
    return /docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(u)
  }

  async function save() {
    setMessage('')
    if (!validUrl(url)) {
      setStatus('error')
      setMessage('Невалидна Google Sheets връзка.')
      return
    }
    setStatus('saving')
    try {
      await setScheduleSource(url)
      setStatus('ok')
      setMessage('Графикът е зареден успешно.')
      onLoaded?.()
    } catch (e) {
      setStatus('error')
      setMessage(e.message || 'Графикът не може да бъде зареден. Проверете Google Sheet връзката.')
    }
  }

  return (
    <div className="source-config">
      <button className="source-config__toggle" onClick={() => setOpen((o) => !o)}>
        ⚙️ Google Sheet за текущия график {open ? '▲' : '▼'}
      </button>
      {open ? (
        <div className="source-config__body">
          <label className="field">
            <span className="field__label">Google Sheet за текущия график</span>
            <input
              className="input"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <button
            className="btn btn--primary btn--sm"
            onClick={save}
            disabled={status === 'saving'}
          >
            {status === 'saving' ? 'Зареждане…' : 'Зареди графика'}
          </button>
          {message ? (
            <p className={status === 'ok' ? 'form-success' : 'form-error'}>{message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
