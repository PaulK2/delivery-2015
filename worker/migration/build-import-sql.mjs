// One-time migration: transform the exportAllData() JSON dump (Google Sheets, via
// Apps Script) into a D1-ready .sql file. Run with:
//   node worker/migration/build-import-sql.mjs <export.json> <output.sql>
//
// Handles the one real quirk in the raw export: Google Sheets auto-coerces stored
// date-ish strings into Date cells, so Apps Script's readObjects() (used by
// exportAllData, unlike the app's normal getters) returns raw Date objects for those
// columns, which JSON.stringify serializes as UTC instants like
// "2026-08-30T21:00:00.000Z" instead of the intended Sofia-local calendar date. This
// reverses that — the same fix normalizeIsoDate()/dateOnly() apply everywhere else in
// the app (see backend/Backend.gs and worker/lib/util.js).
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  console.error('Usage: node build-import-sql.mjs <export.json> <output.sql>')
  process.exit(1)
}

const TIMEZONE = 'Europe/Sofia'
const SHEETS_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

function partsInTZ(date, opts) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, ...opts }).formatToParts(date)
  const map = {}
  for (const p of parts) map[p.type] = p.value
  return map
}

// yyyy-MM-dd, Sofia-local.
function toDateOnly(value) {
  if (typeof value !== 'string' || !SHEETS_DATE_RE.test(value)) return value
  const p = partsInTZ(new Date(value), { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${p.year}-${p.month}-${p.day}`
}

// yyyy-MM-ddTHH:mm:ss, Sofia-local.
function toTimestamp(value) {
  if (typeof value !== 'string' || !SHEETS_DATE_RE.test(value)) return value
  const p = partsInTZ(new Date(value), {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const hour = p.hour === '24' ? '00' : p.hour
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}`
}

function sqlLit(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  const s = String(value)
  if (s === '') return "''"
  return `'${s.replace(/'/g, "''")}'`
}

// '' -> NULL for genuinely numeric columns (Sheets leaves unset numeric cells blank).
function sqlNum(value) {
  if (value === '' || value === null || value === undefined) return 'NULL'
  const n = Number(value)
  return isNaN(n) ? 'NULL' : String(n)
}

function sqlBool(value) {
  return value === true || value === 1 || value === '1' ? '1' : '0'
}

function insert(table, columns, rows) {
  if (!rows.length) return ''
  const lines = rows.map((vals) => `(${vals.join(', ')})`)
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n  ${lines.join(',\n  ')};\n`
}

const data = JSON.parse(readFileSync(inputPath, 'utf8'))
let sql = 'PRAGMA foreign_keys = OFF;\n\n'

// employees — include the two named admins that exist in code (ADMIN_USER_NAMES) but
// weren't found in the exported sheet (Маги was added to Backend.gs in a prior session
// but migrateAdminsAndAuth() was never re-run against the live sheet before this export).
const employees = data.employees.map((e) => [
  sqlLit(e.employee_id), sqlLit(e.name), sqlLit(e.role || 'employee'),
  sqlLit(e.password_hash || ''), sqlBool(e.password_configured), sqlBool(e.active),
])
const existingNames = new Set(data.employees.map((e) => String(e.name || '').toLowerCase().replace(/\s+/g, '')))
if (!existingNames.has('маги')) {
  employees.push([sqlLit('EMP-magi-admin01'), sqlLit('Маги'), sqlLit('admin'), sqlLit(''), '0', '1'])
}
sql += insert(
  'employees',
  ['employee_id', 'name', 'role', 'password_hash', 'password_configured', 'active'],
  employees
)

sql += insert(
  'locations',
  ['location_id', 'name', 'address', 'latitude', 'longitude', 'active'],
  data.locations.map((l) => [
    sqlLit(l.location_id), sqlLit(l.name), sqlLit(l.address || ''),
    sqlNum(l.latitude), sqlNum(l.longitude), sqlBool(l.active),
  ])
)

sql += insert(
  'settings',
  ['key', 'value'],
  data.settings.map((s) => [sqlLit(s.key), sqlLit(String(s.value ?? ''))])
)

sql += insert(
  'audit',
  ['audit_id', 'timestamp', 'employee_id', 'employee_name', 'action', 'entity_type', 'entity_id', 'details'],
  data.audit.map((a) => [
    sqlLit(a.audit_id), sqlLit(toTimestamp(a.timestamp)), sqlLit(a.employee_id || ''), sqlLit(a.employee_name || ''),
    sqlLit(a.action || ''), sqlLit(a.entity_type || ''), sqlLit(a.entity_id || ''), sqlLit(a.details || ''),
  ])
)

sql += insert(
  'cars',
  [
    'car_id', 'registration', 'make', 'model', 'year', 'image', 'status',
    'current_driver_id', 'current_driver_name', 'current_usage_id', 'parked_location', 'notes', 'active',
    'last_odometer', 'last_oil_change_odometer', 'last_oil_change_date', 'fuel_cash_start', 'fuel_spent_total',
  ],
  data.cars.map((c) => [
    sqlLit(c.car_id), sqlLit(c.registration), sqlLit(c.make || ''), sqlLit(c.model || ''), sqlLit(String(c.year ?? '')),
    sqlLit(c.image || ''), sqlLit(c.status || 'available'),
    sqlLit(c.current_driver_id || ''), sqlLit(c.current_driver_name || ''), sqlLit(c.current_usage_id || ''),
    sqlLit(c.parked_location || ''), sqlLit(c.notes || ''), sqlBool(c.active),
    sqlNum(c.last_odometer), sqlNum(c.last_oil_change_odometer), sqlLit(toDateOnly(c.last_oil_change_date) || ''),
    sqlNum(c.fuel_cash_start), sqlNum(c.fuel_spent_total),
  ])
)

sql += insert(
  'usage_history',
  [
    'usage_id', 'car_id', 'registration', 'employee_id', 'employee_name', 'start_at', 'end_at',
    'parked_location', 'notes', 'fuel_cash_start', 'fuel_spent_total', 'fuel_cash_remaining',
    'has_fire_extinguisher', 'has_first_aid_kit', 'has_warning_triangle', 'has_safety_vest',
  ],
  data.usage_history.map((u) => [
    sqlLit(u.usage_id), sqlLit(u.car_id), sqlLit(u.registration || ''), sqlLit(u.employee_id || ''), sqlLit(u.employee_name || ''),
    sqlLit(toTimestamp(u.start_at)), sqlLit(toTimestamp(u.end_at) || ''),
    sqlLit(u.parked_location || ''), sqlLit(u.notes || ''),
    sqlNum(u.fuel_cash_start), sqlNum(u.fuel_spent_total), sqlNum(u.fuel_cash_remaining),
    sqlBool(u.has_fire_extinguisher), sqlBool(u.has_first_aid_kit), sqlBool(u.has_warning_triangle), sqlBool(u.has_safety_vest),
  ])
)

sql += insert(
  'maintenance',
  [
    'maintenance_id', 'car_id', 'registration', 'reported_by_id', 'reported_by_name', 'reported_at',
    'title', 'description', 'category', 'severity', 'status', 'resolved_at', 'resolved_by_id',
    'resolved_by_name', 'repair_description', 'service', 'cost', 'notes',
  ],
  data.maintenance.map((m) => [
    sqlLit(m.maintenance_id), sqlLit(m.car_id), sqlLit(m.registration || ''), sqlLit(m.reported_by_id || ''), sqlLit(m.reported_by_name || ''),
    sqlLit(toTimestamp(m.reported_at)), sqlLit(m.title || ''), sqlLit(m.description || ''), sqlLit(m.category || 'other'),
    sqlLit(m.severity || 'low'), sqlLit(m.status || 'open'), sqlLit(toTimestamp(m.resolved_at) || ''),
    sqlLit(m.resolved_by_id || ''), sqlLit(m.resolved_by_name || ''), sqlLit(m.repair_description || ''),
    sqlLit(m.service || ''), sqlLit(String(m.cost ?? '')), sqlLit(m.notes || ''),
  ])
)

sql += insert(
  'documents',
  ['document_id', 'car_id', 'registration', 'type', 'provider', 'document_number', 'valid_from', 'valid_until', 'warning_days', 'notes'],
  data.documents.map((doc) => [
    sqlLit(doc.document_id), sqlLit(doc.car_id), sqlLit(doc.registration || ''), sqlLit(doc.type || ''), sqlLit(doc.provider || ''),
    sqlLit(doc.document_number || ''), sqlLit(toDateOnly(doc.valid_from) || ''), sqlLit(toDateOnly(doc.valid_until) || ''),
    sqlNum(doc.warning_days) === 'NULL' ? '30' : sqlNum(doc.warning_days), sqlLit(doc.notes || ''),
  ])
)

sql += insert(
  'availability',
  ['availability_id', 'employee_id', 'employee_name', 'week_start', 'date', 'shift_type', 'updated_at'],
  data.availability.map((a) => [
    sqlLit(a.availability_id), sqlLit(a.employee_id), sqlLit(a.employee_name || ''),
    sqlLit(toDateOnly(a.week_start)), sqlLit(toDateOnly(a.date)), sqlLit(a.shift_type), sqlLit(toTimestamp(a.updated_at)),
  ])
)

sql += insert(
  'orders',
  ['order_record_id', 'employee_id', 'employee_name', 'date', 'week_start', 'restaurant', 'shift_type', 'order_count', 'order_salary', 'updated_at'],
  data.orders.map((o) => [
    sqlLit(o.order_record_id), sqlLit(o.employee_id), sqlLit(o.employee_name || ''),
    sqlLit(toDateOnly(o.date)), sqlLit(toDateOnly(o.week_start)), sqlLit(o.restaurant || ''), sqlLit(o.shift_type || ''),
    sqlNum(o.order_count) === 'NULL' ? '0' : sqlNum(o.order_count), sqlNum(o.order_salary) === 'NULL' ? '0' : sqlNum(o.order_salary),
    sqlLit(toTimestamp(o.updated_at)),
  ])
)

sql += insert(
  'fuel_expenses',
  ['fuel_entry_id', 'car_id', 'registration', 'employee_id', 'employee_name', 'usage_id', 'amount', 'date', 'week_start', 'created_at', 'notes'],
  data.fuel_expenses.map((f) => [
    sqlLit(f.fuel_entry_id), sqlLit(f.car_id), sqlLit(f.registration || ''), sqlLit(f.employee_id), sqlLit(f.employee_name || ''),
    sqlLit(f.usage_id || ''), sqlNum(f.amount) === 'NULL' ? '0' : sqlNum(f.amount),
    sqlLit(toDateOnly(f.date)), sqlLit(toDateOnly(f.week_start)), sqlLit(toTimestamp(f.created_at)), sqlLit(f.notes || ''),
  ])
)

sql += insert(
  'daily_reports',
  ['report_id', 'employee_id', 'employee_name', 'date', 'week_start', 'restaurant', 'delivery_type', 'amount', 'updated_at'],
  data.daily_reports.map((r) => [
    sqlLit(r.report_id), sqlLit(r.employee_id), sqlLit(r.employee_name || ''),
    sqlLit(toDateOnly(r.date)), sqlLit(toDateOnly(r.week_start)), sqlLit(r.restaurant || ''), sqlLit(r.delivery_type || ''),
    sqlNum(r.amount) === 'NULL' ? '0' : sqlNum(r.amount), sqlLit(toTimestamp(r.updated_at)),
  ])
)

sql += insert(
  'payroll',
  [
    'payroll_id', 'employee_id', 'employee_name', 'week_start', 'base_salary', 'orders_count', 'orders_salary',
    'fuel_salary', 'final_amount', 'paid', 'paid_at', 'paid_by_id', 'paid_by_name',
    'received_confirmed', 'received_confirmed_at', 'updated_at',
  ],
  data.payroll.map((p) => [
    sqlLit(p.payroll_id), sqlLit(p.employee_id), sqlLit(p.employee_name || ''), sqlLit(toDateOnly(p.week_start)),
    sqlNum(p.base_salary), sqlNum(p.orders_count), sqlNum(p.orders_salary), sqlNum(p.fuel_salary), sqlNum(p.final_amount),
    sqlBool(p.paid), sqlLit(toTimestamp(p.paid_at) || ''), sqlLit(p.paid_by_id || ''), sqlLit(p.paid_by_name || ''),
    sqlBool(p.received_confirmed), sqlLit(toTimestamp(p.received_confirmed_at) || ''), sqlLit(toTimestamp(p.updated_at)),
  ])
)

writeFileSync(outputPath, sql, 'utf8')
console.log(`Wrote ${outputPath} (${(sql.length / 1024).toFixed(1)} KB)`)
