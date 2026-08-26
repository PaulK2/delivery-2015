import { useEffect, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { getEmployeesForLogin } from '../services/auth/auth.js'
import { CONFIG } from '../config/index.js'
import Spinner from '../components/Spinner.jsx'

export default function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()

  const [employees, setEmployees] = useState(null)
  const [employeeId, setEmployeeId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let alive = true
    getEmployeesForLogin()
      .then((list) => alive && setEmployees(list || []))
      .catch((e) => alive && setLoadError(e.message))
    return () => {
      alive = false
    }
  }, [])

  if (isAuthenticated) return <Navigate to="/" replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!employeeId) return setError('Изберете служител.')
    if (!/^\d{4,6}$/.test(pin)) return setError('PIN трябва да е 4–6 цифри.')

    setSubmitting(true)
    try {
      await login(employeeId, pin)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Входът е неуспешен.')
      setPin('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__brand">
          <span className="login-card__logo">🚚</span>
          <h1>{CONFIG.appName}</h1>
          <p className="login-card__org">{CONFIG.organization}</p>
        </div>

        {loadError ? (
          <p className="form-error" role="alert">
            {loadError}
          </p>
        ) : employees === null ? (
          <Spinner label="Зареждане…" />
        ) : (
          <form onSubmit={onSubmit} className="login-form">
            <label className="field">
              <span className="field__label">Изберете служител</span>
              <select
                className="input"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                autoComplete="username"
              >
                <option value="">— Изберете —</option>
                {employees.map((emp) => (
                  <option key={emp.employee_id} value={emp.employee_id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">PIN</span>
              <input
                className="input"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
              />
            </label>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <button className="btn btn--primary btn--block" disabled={submitting}>
              {submitting ? 'Влизане…' : 'Вход'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
