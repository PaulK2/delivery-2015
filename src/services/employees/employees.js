// Employees service (spec §51, §73).
import { api } from '../api/client.js'

export async function getEmployees() {
  const data = await api('getEmployees', {})
  return data?.employees || []
}

// Admin: create or update an employee (name, role, active). New employees get an
// initial PIN if provided (spec §73).
export async function saveEmployee(employee) {
  return api('saveEmployee', { employee })
}

// Admin: reset an employee's PIN (spec §73).
export async function resetEmployeePin(employeeId, pin) {
  return api('resetEmployeePin', { employeeId, pin })
}
