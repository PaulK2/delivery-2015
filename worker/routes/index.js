// Action dispatch table — mirrors Backend.gs's ROUTES map (action name -> handler).
// D1 mutations are made safe with atomic SQL (conditional UPDATEs, batched
// transactions, upserts) at the point they're written, so — unlike Apps Script's
// global LockService — no serialization wrapper is needed here.
import * as employees from './employees.js'
import * as locations from './locations.js'
import * as schedule from './schedule.js'
import * as cars from './cars.js'
import * as maintenance from './maintenance.js'
import * as documents from './documents.js'
import * as availability from './availability.js'
import * as orders from './orders.js'
import * as fuel from './fuel.js'
import * as reports from './reports.js'
import * as payroll from './payroll.js'
import * as devnotes from './devnotes.js'
import * as roadbook from './roadbook.js'

export const ROUTES = {
  // Authentication
  getEmployeesForLogin: employees.getEmployeesForLogin,
  login: employees.login,
  logout: employees.logout,
  validateSession: employees.validateSession,
  getCurrentUser: employees.getCurrentUser,

  // Employees
  getEmployees: employees.getEmployees,
  saveEmployee: employees.saveEmployee,
  deleteEmployee: employees.deleteEmployee,
  resetEmployeePassword: employees.resetEmployeePassword,
  resetEmployeePin: employees.resetEmployeePassword, // back-compat alias

  // Locations
  getLocations: locations.getLocations,
  saveLocation: locations.saveLocation,

  // Schedule (boss's sheet — read only)
  getScheduleRaw: schedule.getScheduleRaw,
  getScheduleSource: schedule.getScheduleSource,
  setScheduleSource: schedule.setScheduleSource,

  // Schedule archive (admin — past weeks' schedule links)
  getScheduleArchive: schedule.getScheduleArchive,
  saveScheduleArchiveLink: schedule.saveScheduleArchiveLink,
  deleteScheduleArchiveLink: schedule.deleteScheduleArchiveLink,
  getArchivedScheduleRaw: schedule.getArchivedScheduleRaw,

  // Cars
  getCars: cars.getCars,
  getCar: cars.getCar,
  saveCar: cars.saveCar,
  deleteCar: cars.deleteCar,
  takeCar: cars.takeCar,
  recordOilChange: cars.recordOilChange,
  releaseCar: cars.releaseCar,

  // Usage history
  getCarUsageHistory: cars.getCarUsageHistory,

  // One-time initial-activation helper
  bootstrapCarAssignments: cars.bootstrapCarAssignments,

  // Maintenance
  getMaintenance: maintenance.getMaintenance,
  reportIssue: maintenance.reportIssue,
  resolveIssue: maintenance.resolveIssue,

  // Documents
  getVehicleDocuments: documents.getVehicleDocuments,
  saveVehicleDocument: documents.saveVehicleDocument,

  // Availability
  getAvailability: availability.getAvailability,
  saveAvailability: availability.saveAvailability,
  setAvailabilityOpen: availability.setAvailabilityOpen,
  getAvailabilityStatus: availability.getAvailabilityStatus,
  setAvailabilityWeek: availability.setAvailabilityWeek,

  // Orders
  getOrdersForWeek: orders.getOrdersForWeek,
  saveOrderCount: orders.saveOrderCount,

  // Fuel expenses
  addFuelExpense: fuel.addFuelExpense,
  getFuelExpensesForWeek: fuel.getFuelExpensesForWeek,
  getFuelExpensesForUsage: fuel.getFuelExpensesForUsage,

  // Daily reports
  saveDailyReport: reports.saveDailyReport,
  getDailyReport: reports.getDailyReport,
  getReportsForDate: reports.getReportsForDate,

  // Payroll
  getPayrollForWeek: payroll.getPayrollForWeek,
  getMyPayroll: payroll.getMyPayroll,
  setPayrollPaid: payroll.setPayrollPaid,
  confirmPayrollReceived: payroll.confirmPayrollReceived,

  // Private dev changelog (ПАВЕЛ / В. ПЕТКОВ only)
  getDevNotes: devnotes.getDevNotes,
  addDevNote: devnotes.addDevNote,
  deleteDevNote: devnotes.deleteDevNote,

  // Пътен лист (Road Book) — admin only
  getRoadBook: roadbook.getRoadBook,
  exportRoadBookExcel: roadbook.exportRoadBookExcel,
  getRoadBookExportArchive: roadbook.getRoadBookExportArchive,
  downloadRoadBookExport: roadbook.downloadRoadBookExport,
}
