import { useEffect, useState } from 'react'
import { getDevNotes, addDevNote, deleteDevNote } from '../../services/devnotes/devnotes.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import Spinner from '../Spinner.jsx'

// Private changelog for ПАВЕЛ / В. ПЕТКОВ only (enforced by the backend on every
// route here — not just this tab being hidden from other admins). When either posts
// an update, the other sees it here, tagged with the app version at the time.
export default function AdminDevNotes() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  async function load() {
    setError('')
    try {
      setList(await getDevNotes())
    } catch (e) {
      setError(e.message || 'Грешка при зареждане.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function onPost() {
    if (!draft.trim()) return
    setPosting(true)
    try {
      await addDevNote(draft.trim())
      setDraft('')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setPosting(false)
    }
  }

  async function onDelete(noteId) {
    try {
      await deleteDevNote(noteId)
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    }
  }

  if (list === null) return error ? <div className="banner banner--error">{error}</div> : <Spinner label="Зареждане…" />

  return (
    <div>
      <p className="admin-hint">
        Вижда се само от ПАВЕЛ и В. ПЕТКОВ — нито другите админи, нито служителите имат
        достъп до този раздел.
      </p>

      <div className="dev-note-form">
        <textarea
          className="input dev-note-form__textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Какво промени/направи…"
          rows={3}
        />
        <button className="btn btn--primary btn--sm" onClick={onPost} disabled={posting || !draft.trim()}>
          {posting ? 'Публикуване…' : 'Публикувай'}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty-state empty-state--sm">Все още няма бележки.</div>
      ) : (
        <ul className="dev-notes-list">
          {list.map((n) => (
            <li key={n.note_id} className="dev-note">
              <div className="dev-note__head">
                <span className="dev-note__author">{n.author_name}</span>
                <span className="dev-note__date">{n.created_at?.replace('T', ' ').slice(0, 16)}</span>
                {n.app_version ? <span className="dev-note__version">{n.app_version}</span> : null}
              </div>
              <p className="dev-note__content">{n.content}</p>
              {n.author_id === user?.employee_id ? (
                <button className="dev-note__delete" onClick={() => onDelete(n.note_id)}>
                  Изтрий
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
