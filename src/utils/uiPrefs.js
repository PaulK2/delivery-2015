// Lightweight, theme-neutral UI preferences persisted in localStorage.
// These change SIZE and one-time hints only — never colours or icons.

const FONT_KEY = 'fv_font_scale' // 'lg' when large text is on
const INTRO_KEY = 'fv_intro_seen' // '1' once the first-run intro is dismissed
const VIEW_KEY = 'fv_view_as_worker' // '1' when a worker-admin is viewing the worker UI

function safeGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key, val) {
  try {
    if (val == null) localStorage.removeItem(key)
    else localStorage.setItem(key, val)
  } catch {
    /* ignore storage errors */
  }
}

// ---- Large text (accessibility) ----

export function isLargeText() {
  return safeGet(FONT_KEY) === 'lg'
}

// Reflect the current preference onto <html> so a single CSS rule scales the app.
export function applyFontScale() {
  const on = isLargeText()
  const el = document.documentElement
  if (el) el.classList.toggle('font-lg', on)
  return on
}

export function setLargeText(on) {
  safeSet(FONT_KEY, on ? 'lg' : null)
  applyFontScale()
  return on
}

// ---- "View as worker" (worker-admins only) ----

export function isViewAsWorker() {
  return safeGet(VIEW_KEY) === '1'
}
export function setViewAsWorkerPref(on) {
  safeSet(VIEW_KEY, on ? '1' : null)
}

// ---- First-run intro ----

export function hasSeenIntro() {
  return safeGet(INTRO_KEY) === '1'
}
export function markIntroSeen() {
  safeSet(INTRO_KEY, '1')
}
