// Authentication service. Wraps the backend auth actions (spec §53, §54, §60).
// The PIN is never stored on the device — only an opaque session token (spec §54).
import { api, setToken, getToken } from '../api/client.js'
import { invalidateAll } from '../api/cache.js'

const USER_KEY = 'fv_user'

// The last validated user is cached so a temporary backend hiccup at startup doesn't
// bounce a logged-in user back to the login screen (spec §79). It is NOT an auth
// source of truth — the token is; it only keeps the UI logged in while we retry.
function cacheUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore storage errors */
  }
}

function cachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function clearSession() {
  setToken(null)
  cacheUser(null)
}

// Log in with the user's personal password. On a first login (password not yet
// configured) the same call sets the chosen password server-side and logs in.
// The password is only ever passed through to the backend — never stored on the device.
export async function login(employeeId, password) {
  const data = await api('login', { employeeId, password })
  if (data?.token) setToken(data.token)
  cacheUser(data?.user || null)
  return data?.user || null
}

export async function logout() {
  try {
    await api('logout', {})
  } catch {
    /* even if the server call fails, drop the local session */
  }
  clearSession()
  invalidateAll() // never let the next user see this session's cached data
}

// Returns the current user if the stored token is still valid, else null.
// Importantly, only an explicit auth/session error logs the user out. Timeouts,
// network errors, HTTP failures and temporary Apps Script unavailability keep the
// existing session and return the last known user, so the app doesn't appear
// "disconnected" over a brief hiccup (spec §79; requirements §11/§12).
export async function validateSession() {
  if (!getToken()) return null
  try {
    const data = await api('validateSession', {})
    const user = data?.user || null
    cacheUser(user)
    return user
  } catch (e) {
    // Only an explicit session/auth error ends the session (requirement §12).
    if (e?.code === 'unauthorized') {
      clearSession()
      return null
    }
    // Timeout / network / HTTP / temporary Apps Script failure → keep the session and
    // stay logged in optimistically with the last known user (requirements §10/§11).
    return cachedUser()
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
