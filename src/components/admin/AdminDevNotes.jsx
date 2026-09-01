import { useEffect, useState } from 'react'
import { getDevNotes, addDevNote, deleteDevNote } from '../../services/devnotes/devnotes.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import Spinner from '../Spinner.jsx'

// Private changelog for ПАВЕЛ / В. ПЕТКОВ only (enforced by the backend on every
// route here — not just this tab being hidden from other admins). When either posts
// an update, the other sees it here, tagged with the app version at the time. English
// on purpose — this tab is the two devs' own space, unlike the rest of the app (Bulgarian).
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
      setError(e.message || 'Failed to load.')
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
      showToast(e.message || 'Something went wrong.', 'error')
    } finally {
      setPosting(false)
    }
  }

  async function onDelete(noteId) {
    try {
      await deleteDevNote(noteId)
      await load()
    } catch (e) {
      showToast(e.message || 'Something went wrong.', 'error')
    }
  }

  if (list === null) return error ? <div className="banner banner--error">{error}</div> : <Spinner label="Loading…" />

  return (
    <div>
      <p className="admin-hint">
        Visible only to ПАВЕЛ and В. ПЕТКОВ — no other admin, and no regular user, has
        access to this tab.
      </p>

      <div className="dev-note-form">
        <textarea
          className="input dev-note-form__textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What changed / what you did…"
          rows={3}
        />
        <button className="btn btn--primary btn--sm" onClick={onPost} disabled={posting || !draft.trim()}>
          {posting ? 'Posting…' : 'Post'}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty-state empty-state--sm">No notes yet.</div>
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
                  Delete
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
