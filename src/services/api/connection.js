// Shared connection-health signal for the whole app.
//
// The API client reports the outcome of each backend call here. A single failed
// request is NOT an outage — we only escalate to a visible warning after repeated
// transient failures, and recover automatically as soon as any call succeeds.
//
// Status values:
//   'online'   — last relevant call succeeded (no banner)
//   'unstable' — one or more consecutive transient failures, still retrying (soft banner)
//   'lost'     — many consecutive transient failures (stronger banner)
//
// Only transient failures (network/timeout/bad response/server error) count here.
// Business errors (unauthorized, validation, car_taken, …) never affect connection
// status — they mean the server answered, just not with what we wanted.

import { CONFIG } from '../../config/index.js'

const STRONG_THRESHOLD = CONFIG.net.strongFailureThreshold

let state = { status: 'online', consecutiveFailures: 0 }
const listeners = new Set()

function emit() {
  for (const fn of listeners) fn()
}

export function getConnectionState() {
  return state
}

export function subscribeConnection(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// A backend call completed successfully → connectivity is fine again.
export function reportSuccess() {
  if (state.status === 'online' && state.consecutiveFailures === 0) return
  state = { status: 'online', consecutiveFailures: 0 }
  emit()
}

// A transient failure (after any automatic retries) — escalate gradually.
export function reportFailure() {
  const consecutiveFailures = state.consecutiveFailures + 1
  const status = consecutiveFailures >= STRONG_THRESHOLD ? 'lost' : 'unstable'
  if (status === state.status && consecutiveFailures === state.consecutiveFailures) return
  state = { status, consecutiveFailures }
  emit()
}
