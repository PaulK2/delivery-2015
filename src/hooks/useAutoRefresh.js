import { useEffect, useRef } from 'react'

// Central auto-refresh scheduler.
//
// Calls `fn` every `intervalMs`, but:
//   - pauses while the browser tab is hidden (no pointless Apps Script calls in the
//     background);
//   - fires immediately when the tab becomes visible again or the window regains focus.
//
// Overlap prevention is the caller's job (guard with an in-flight ref) — this only
// decides *when* to fire. `fn` should perform a forced/revalidating refresh.
export function useAutoRefresh(fn, intervalMs) {
  const saved = useRef(fn)
  saved.current = fn

  useEffect(() => {
    let id = null
    const run = () => {
      if (!document.hidden) saved.current()
    }
    const start = () => {
      if (id == null) id = setInterval(run, intervalMs)
    }
    const stop = () => {
      if (id != null) {
        clearInterval(id)
        id = null
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else {
        saved.current() // catch up right away
        start()
      }
    }
    const onFocus = () => {
      if (!document.hidden) saved.current()
    }

    start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [intervalMs])
}
