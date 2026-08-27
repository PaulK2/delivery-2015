// Employees service (spec §51, §73).
import { api } from '../api/client.js'

export async function getEmployees() {
  const data = await api('getEmployees', {})
  return data?.employees || []
}

// Admin: create or update an employee (name, role, active). New employees have no
// password — they create their own on first login (spec §73).
export async function saveEmployee(employee) {
  return api('saveEmployee', { employee })
}

// Admin: reset an employee's password. This clears the stored hash and marks the
// account as requiring setup, so the user creates a new password on next login.
// The admin never sets or sees the password.
export async function resetEmployeePassword(employeeId) {
  return api('resetEmployeePassword', { employeeId })
}

// Admin: permanently delete an employee.
export async function deleteEmployee(employeeId) {
  return api('deleteEmployee', { employeeId })
}
