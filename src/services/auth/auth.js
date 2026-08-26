// Authentication service. Wraps the backend auth actions (spec §53, §54, §60).
// The PIN is never stored on the device — only an opaque session token (spec §54).
import { api, setToken, getToken } from '../api/client.js'

export async function login(employeeId, pin) {
  const data = await api('login', { employeeId, pin })
  if (data?.token) setToken(data.token)
  return data?.user || null
}

export async function logout() {
  try {
    await api('logout', {})
  } catch {
    /* even if the server call fails, drop the local session */
  }
  setToken(null)
}

// Returns the current user if the stored token is still valid, else null.
export async function validateSession() {
  if (!getToken()) return null
  try {
    const data = await api('validateSession', {})
    return data?.user || null
  } catch {
    setToken(null)
    return null
  }
}

// Public: list of employees for the login dropdown (spec §53). No PINs returned.
// The backend returns either a bare array or { employees: [...] } — accept both.
export async function getEmployeesForLogin() {
  const data = await api('getEmployeesForLogin', {})
  return Array.isArray(data) ? data : data?.employees || []
}

export function isAdmin(user) {
  return user?.role === 'admin'
}
