import { useEffect, useState } from 'react'
import {
  getScheduleArchive,
  saveScheduleArchiveLink,
  deleteScheduleArchiveLink,
} from '../../services/schedule/schedule.js'
import { formatDateBG } from '../../utils/datetime.js'
import { useToast } from '../../context/ToastContext.jsx'
import Spinner from '../Spinner.jsx'
import ScheduleArchiveModal from './ScheduleArchiveModal.jsx'
import ScheduleArchiveViewer from './ScheduleArchiveViewer.jsx'
import ConfirmModal from '../ConfirmModal.jsx'

const MAX_LINKS = 4

// Admin: a small archive (up to 4) of past schedule sheet links — e.g. the last month's
// weeks — kept on hand so an old week's grid can still be looked up after the boss
// moves the live source (Schedule page) on to a new sheet. Read-only against those
// sheets, same as the live source.
export default function AdminScheduleArchive() {
  const { showToast } = useToast()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(undefined) // undefined=closed, null=new, obj=edit
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      setList(await getScheduleArchive())
    } catch (e) {
      setError(e.message || 'Грешка при зареждане.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function onSave(link) {
    setBusy(true)
    try {
      await saveScheduleArchiveLink(link)
      setEditing(undefined)
      showToast('Връзката е записана.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    setBusy(true)
    try {
      await deleteScheduleArchiveLink(deleting.archive_id)
      setDeleting(null)
      showToast('Връзката е изтрита.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (list === null) return error ? <div className="banner banner--error">{error}</div> : <Spinner label="Зареждане…" />

  return (
    <div>
      <p className="admin-hint">
        Пазете тук връзки към графика за последните седмици (до {MAX_LINKS}), за да можете
        да проверите стар график, след като шефът мине на нов Google Sheet. Не се
        използва за текущия/активния график — той се задава от страница „График“.
      </p>

      <div className="admin-toolbar">
        <span className="admin-toolbar__count">{list.length} от {MAX_LINKS} връзки</span>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => setEditing(null)}
          disabled={list.length >= MAX_LINKS}
        >
          + Нова връзка
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty-state empty-state--sm">Няма архивирани връзки към графика.</div>
      ) : (
        <ul className="admin-list">
          {list.map((l) => (
            <li key={l.archive_id} className="admin-row">
              <div className="admin-row__main">
                <span className="admin-row__name">{l.label}</span>
                <span className="admin-row__sub">
                  Добавена на {l.created_at ? formatDateBG(l.created_at.slice(0, 10)) : '—'}
                </span>
              </div>
              <div className="admin-row__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => setViewing(l)}>
                  Преглед
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setEditing(l)}>
                  Редактирай
                </button>
                <button className="btn btn--danger-ghost btn--sm" onClick={() => setDeleting(l)}>
                  Изтрий
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined ? (
        <ScheduleArchiveModal
          link={editing}
          onClose={() => setEditing(undefined)}
          onSubmit={onSave}
          submitting={busy}
        />
      ) : null}

      {viewing ? <ScheduleArchiveViewer link={viewing} onClose={() => setViewing(null)} /> : null}

      {deleting ? (
        <ConfirmModal
          title="Изтриване на архивна връзка"
          message={`Сигурни ли сте, че искате да изтриете „${deleting.label}“? Действието е необратимо.`}
          onConfirm={onDelete}
          onClose={() => setDeleting(null)}
          busy={busy}
        />
      ) : null}
    </div>
  )
}
