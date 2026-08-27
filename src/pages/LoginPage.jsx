import { useEffect, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { getEmployeesForLogin } from '../services/auth/auth.js'
import { CONFIG } from '../config/index.js'
import Spinner from '../components/Spinner.jsx'
import Icon from '../components/Icon.jsx'

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

  // Only administrators sign in with a PIN; ordinary staff just pick their name.
  const selected = employees?.find((emp) => emp.employee_id === employeeId)
  const needsPin = !!selected?.requires_pin

  function onSelectEmployee(id) {
    setEmployeeId(id)
    setPin('')
    setError('')
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!employeeId) return setError('Изберете служител.')
    if (needsPin && !/^\d{4,6}$/.test(pin)) return setError('PIN трябва да е 4–6 цифри.')

    setSubmitting(true)
    try {
      await login(employeeId, needsPin ? pin : '')
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
          <span className="login-card__logo">
            <Icon name="truck" size={44} />
          </span>
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
                onChange={(e) => onSelectEmployee(e.target.value)}
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

            {needsPin ? (
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
                  autoFocus
                />
              </label>
            ) : null}

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
