// Employees service (spec §51, §73).
import { api } from '../api/client.js'

export async function getEmployees() {
  const data = await api('getEmployees', {})
  return data?.employees || []
}
