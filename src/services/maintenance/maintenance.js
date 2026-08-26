// Maintenance service (spec §37–§45, §102).
import { api } from '../api/client.js'

// getMaintenance(carId?, status?) -> issues (spec §42). status: 'open' | 'resolved'.
export async function getMaintenance({ carId, status } = {}) {
  const data = await api('getMaintenance', { carId, status })
  return data?.maintenance || []
}

// Report a new issue (spec §37). reporter + timestamp set server-side.
export async function reportIssue(issue) {
  return api('reportIssue', { issue })
}

// Resolve an issue — admin only (spec §43).
export async function resolveIssue(payload) {
  return api('resolveIssue', payload)
}
