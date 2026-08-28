import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { login as apiLogin, logout as apiLogout, validateSession } from '../services/auth/auth.js'
import { isViewAsWorker, setViewAsWorkerPref } from '../utils/uiPrefs.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // A worker-admin (ПАВЕЛ, В. ПЕТКОВ) can temporarily view the app as a regular worker.
  const [viewAsWorker, setViewAsWorkerState] = useState(() => isViewAsWorker())

  useEffect(() => {
    let alive = true
    validateSession()
      .then((u) => alive && setUser(u))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const login = useCallback(async (employeeId, password) => {
    const u = await apiLogin(employeeId, password)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
  }, [])

  const setViewAsWorker = useCallback((on) => {
    setViewAsWorkerPref(on)
    setViewAsWorkerState(on)
  }, [])

  const isRealAdmin = user?.role === 'admin'
  // Capability (not role): may record personal work data — orders, reports, fuel,
  // payment confirmation. True for regular staff and worker-admins (ПАВЕЛ, В. ПЕТКОВ),
  // false for review-only admins (ЦЕЦО, СИМО). Mirrors backend canSubmitAvailability.
  const isWorker = !!user?.can_submit_availability
  // Only worker-admins can flip between the two views.
  const canToggleView = isRealAdmin && isWorker
  // Effective admin flag the whole UI reads: a worker-admin viewing as a worker sees the
  // simpler, non-admin app. The override is ignored for anyone who can't toggle, so a
  // stale flag can never hide admin tools from a real (review-only) admin.
  const isAdmin = isRealAdmin && !(viewAsWorker && canToggleView)

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin,
    isRealAdmin,
    isWorker,
    canToggleView,
    viewAsWorker: viewAsWorker && canToggleView,
    setViewAsWorker,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
