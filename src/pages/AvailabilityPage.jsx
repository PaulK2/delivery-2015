import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getAvailabilityStatus,
  getAvailability,
  saveAvailability,
  setAvailabilityOpen,
  setAvailabilityWeek,
  weekDates,
} from '../services/availability/availability.js'
import { getEmployees } from '../services/employees/employees.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { formatDateBG, todayISO, weekdayIndex } from '../utils/datetime.js'
import DayShiftSelector from '../components/DayShiftSelector.jsx'
import TeamAvailabilityMatrix from '../components/TeamAvailabilityMatrix.jsx'
import AdminAvailabilityPanel from '../components/AdminAvailabilityPanel.jsx'
import Spinner from '../components/Spinner.jsx'

export default function AvailabilityPage() {
  const { user, isAdmin } = useAuth()
  const { showToast } = useToast()

  const [status, setStatus] = useState(null) // { open, weekStart, fallback }
  const [availability, setAvailability] = useState([])
  const [employees, setEmployees] = useState([])
  const [mine, setMine] = useState({}) // { date: shiftType }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [adminBusy, setAdminBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    const st = await getAvailabilityStatus()
    const [avail, emps] = await Promise.all([getAvailability(st.weekStart), getEmployees()])
    setStatus(st)
    setAvailability(avail)
    setEmployees(emps)
    // Seed my selections from my submitted rows.
    const mineMap = {}
    for (const r of avail) {
      if (r.employee_id === user?.employee_id) mineMap[String(r.date)] = r.shift_type
    }
    setMine(mineMap)
  }, [user])

  useEffect(() => {
    setLoading(true)
    load()
      .catch((e) => setError(e.message || 'Данните не могат да бъдат заредени.'))
      .finally(() => setLoading(false))
  }, [load])

  const dates = useMemo(() => (status ? weekDates(status.weekStart) : []), [status])

  async function onSave() {
    if (!status) return
    setSaving(true)
    try {
      const entries = dates.map((d) => ({ date: d, shiftType: mine[d] || 'none' }))
      await saveAvailability(status.weekStart, entries)
      showToast('Наличността ви е записана успешно.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем при записването.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function onToggleOpen(open) {
    setAdminBusy(true)
    try {
      await setAvailabilityOpen(open)
      showToast(open ? 'Приемът е отворен.' : 'Приемът е затворен.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setAdminBusy(false)
    }
  }

  async function onSetWeek(weekStart) {
    setAdminBusy(true)
    try {
      await setAvailabilityWeek(weekStart)
      showToast('Активната седмица е зададена.', 'success')
      await load()
    } catch (e) {
      showToast(e.message || 'Възникна проблем.', 'error')
    } finally {
      setAdminBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="center-screen">
        <Spinner label="Зареждане…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <h1 className="page__title">Следваща седмица</h1>
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      </div>
    )
  }

  const open = status.open

  // Who may submit their own shifts: regular staff, plus worker-admins (ПАВЕЛ,
  // В. ПЕТКОВ) who also work. Pure admins (ЦЕЦО, СИМО) only review. The backend flag
  // is authoritative; fall back to role when it isn't present (older backend).
  const canSubmit = user?.can_submit_availability ?? !isAdmin

  // Submitters can request/edit shifts only until 00:00 Saturday; on Sat/Sun it's locked.
  const weekday = weekdayIndex(todayISO()) // 0=Sun … 6=Sat
  const weekendLocked = canSubmit && (weekday === 6 || weekday === 0)
  const canEdit = open && !weekendLocked

  const weekLabel =
    dates.length === 7 ? `${formatDateBG(dates[0])} – ${formatDateBG(dates[6])}` : ''

  return (
    <div className="page">
      <h1 className="page__title">Следваща седмица</h1>
      <p className="page__subtitle">Наличност за седмица {weekLabel}</p>

      <div className={'banner ' + (!canSubmit ? 'banner--info' : canEdit ? 'banner--ok' : 'banner--warn')}>
        {!canSubmit
          ? 'Преглед на заявките на екипа. Администраторите не подават собствени заявки за смени.'
          : weekendLocked
            ? 'Заявките за смени вече не могат да се редактират — приемът е заключен за събота и неделя.'
            : open
              ? 'Приемът на наличност е отворен. Изберете кога сте на разположение.'
              : 'Приемът на наличност е затворен. Можете само да преглеждате.'}
      </div>

      {/* My availability editor — for anyone who may submit (regular staff + worker-admins).
          Pure admins only review the team (also enforced by the backend). */}
      {canSubmit ? (
        <section className="detail-section">
          <h2 className="detail-section__title">Моята наличност</h2>
          <div className="day-list">
            {dates.map((d) => (
              <DayShiftSelector
                key={d}
                date={d}
                value={mine[d]}
                disabled={!canEdit}
                onChange={(v) => setMine((m) => ({ ...m, [d]: v }))}
              />
            ))}
          </div>
          {canEdit ? (
            <button className="btn btn--primary btn--block" onClick={onSave} disabled={saving}>
              {saving ? 'Записване…' : 'Запази наличността'}
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Team overview — the full list of everyone's requests is admin-only. */}
      {isAdmin ? (
        <section className="detail-section">
          <h2 className="detail-section__title">Наличност на екипа</h2>
          <TeamAvailabilityMatrix employees={employees} availability={availability} dates={dates} />
        </section>
      ) : null}

      {/* Admin controls */}
      {isAdmin ? (
        <AdminAvailabilityPanel
          open={open}
          weekStart={status.weekStart}
          dates={dates}
          availability={availability}
          employees={employees}
          busy={adminBusy}
          onToggleOpen={onToggleOpen}
          onSetWeek={onSetWeek}
        />
      ) : null}
    </div>
  )
}
