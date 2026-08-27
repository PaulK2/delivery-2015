import { useEffect, useMemo, useState } from 'react'
import { getEmployees, resetEmployeePassword } from '../../services/employees/employees.js'
import { useToast } from '../../context/ToastContext.jsx'
import Spinner from '../Spinner.jsx'
import ConfirmModal from '../ConfirmModal.jsx'

// Admin-only "Управление на пароли": shows each user's password status (never the hash
// or password) and lets an admin reset an account back to first-login setup. The reset
// itself is enforced admin-only on the backend.
export default function AdminPasswords() {
  const { showToast } = useToast()
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [resetting, setResetting] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load({ force } = {}) {
    setError('')
    try {
      setList(await getEmployees({ force }))
    } catch (e) {
      setError(e.message || 'Грешка при зареждане.')
    }
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase()
    const arr = list || []
    return n ? arr.filter((e) => e.name.toLowerCase().includes(n)) : arr
  }, [list, q])

  async function onReset() {
    setBusy(true)
    try {
      await resetEmployeePassword(resetting.employee_id)
      setResetting(null)
      showToast('Паролата е нулирана. Потребителят ще създаде нова при следващо влизане.', 'success')
      await load({ force: true })
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (list === null)
    return error ? (
      <div className="banner banner--error">{error}</div>
    ) : (
      <Spinner label="Зареждане…" />
    )

  return (
    <div>
      <p className="field__hint">
        Всеки потребител създава своя парола при първото влизане (минимум 6 символа) и я
        използва след това. Паролите не се показват. Нулирането връща акаунта към
        първоначално създаване на парола и прекратява активните сесии на потребителя.
      </p>

      <div className="admin-toolbar">
        <input
          className="input input--sm"
          type="search"
          placeholder="Търсене на потребител…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <ul className="admin-list">
        {filtered.map((e) => (
          <li key={e.employee_id} className="admin-row">
            <div className="admin-row__main">
              <span className="admin-row__name">{e.name}</span>
              <span className="admin-row__tags">
                {e.role === 'admin' ? <span className="tag tag--accent">Админ</span> : null}
                {!e.active ? <span className="tag tag--muted">Неактивен</span> : null}
                {e.password_configured ? (
                  <span className="tag tag--ok">Парола: конфигурирана</span>
                ) : (
                  <span className="tag tag--muted">Парола: не е конфигурирана</span>
                )}
              </span>
            </div>
            <div className="admin-row__actions">
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setResetting(e)}
                disabled={!e.password_configured}
                title={
                  e.password_configured
                    ? 'Нулиране на паролата'
                    : 'Няма конфигурирана парола за нулиране'
                }
              >
                Нулирай паролата
              </button>
            </div>
          </li>
        ))}
      </ul>

      {resetting ? (
        <ConfirmModal
          title={`Нулиране на парола — ${resetting.name}`}
          message={`Паролата на ${resetting.name} ще бъде премахната и потребителят ще създаде нова при следващото си влизане. Активните му сесии ще бъдат прекратени. Продължавате ли?`}
          confirmLabel="Нулирай паролата"
          busyLabel="Нулиране…"
          danger={false}
          onConfirm={onReset}
          onClose={() => setResetting(null)}
          busy={busy}
        />
      ) : null}
    </div>
  )
}
