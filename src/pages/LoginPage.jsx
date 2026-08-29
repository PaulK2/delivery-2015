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
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const MIN_PASSWORD_LEN = 6

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

  const selected = employees?.find((emp) => emp.employee_id === employeeId)
  // Only administrators sign in with a password; regular staff just pick their name.
  const needsPassword = !!selected?.requires_password
  // First admin login: no password set yet — create one now.
  const firstTime = needsPassword && selected.password_configured === false

  function onSelectEmployee(id) {
    setEmployeeId(id)
    setPassword('')
    setConfirm('')
    setError('')
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!employeeId) return setError('Изберете служител.')

    if (needsPassword) {
      if (!password) return setError('Въведете парола.')
      if (firstTime) {
        if (password.length < MIN_PASSWORD_LEN)
          return setError(`Паролата трябва да е поне ${MIN_PASSWORD_LEN} символа.`)
        if (password !== confirm) return setError('Паролите не съвпадат.')
      }
    }

    setSubmitting(true)
    try {
      // Regular staff send no password; for a first admin login this same call sets
      // the chosen password server-side.
      await login(employeeId, needsPassword ? password : '')
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Входът е неуспешен.')
      setPassword('')
      setConfirm('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__brand">
          <span className="login-card__logo">
            <Icon name="car" size={44} />
          </span>
          <h1>{CONFIG.appName}</h1>
          <p className="login-card__org">вход:</p>
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
                className="input login-select"
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

            {needsPassword ? (
              <>
                {firstTime ? (
                  <p className="login-card__hint">
                    Първо влизане: създайте своя парола (минимум 6 символа).
                  </p>
                ) : null}

                <label className="field">
                  <span className="field__label">{firstTime ? 'Нова парола' : 'Парола'}</span>
                  <div className="password-field">
                    <input
                      className="input password-field__input"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={firstTime ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="password-field__toggle"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Скрий паролата' : 'Покажи паролата'}
                      aria-pressed={showPassword}
                      tabIndex={-1}
                    >
                      <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} />
                    </button>
                  </div>
                </label>

                {firstTime ? (
                  <label className="field">
                    <span className="field__label">Потвърдете паролата</span>
                    <div className="password-field">
                      <input
                        className="input password-field__input"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="••••••"
                      />
                      <button
                        type="button"
                        className="password-field__toggle"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? 'Скрий паролата' : 'Покажи паролата'}
                        aria-pressed={showPassword}
                        tabIndex={-1}
                      >
                        <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} />
                      </button>
                    </div>
                  </label>
                ) : null}
              </>
            ) : null}

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <button className="btn btn--primary btn--block" disabled={submitting}>
              {submitting
                ? firstTime
                  ? 'Създаване…'
                  : 'Влизане…'
                : firstTime
                  ? 'Създай парола и влез'
                  : 'Вход'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
