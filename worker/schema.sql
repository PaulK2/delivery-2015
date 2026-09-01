-- D1 schema for the FleetView operational datastore.
-- One table per former Google Sheets tab, same column names/semantics, so the
-- one-time JSON export from Backend.gs maps onto these tables 1:1.
-- Booleans are stored as INTEGER (0/1). Dates/timestamps stay TEXT ISO strings
-- (yyyy-MM-dd / yyyy-MM-ddTHH:mm:ss), matching the app's existing convention.

CREATE TABLE IF NOT EXISTS employees (
  employee_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  password_hash TEXT NOT NULL DEFAULT '',
  password_configured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS locations (
  location_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  latitude REAL,
  longitude REAL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_employee ON sessions(employee_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- Admin-managed archive of past schedule sheet links (spec: keep the last ~4 weeks'
-- Google Sheet URLs on hand so an old week's grid can still be looked up after the
-- boss moves on to a new sheet). Separate from `settings.current_schedule_sheet_url`,
-- which is the live/current source the Home map and Schedule page actually use.
CREATE TABLE IF NOT EXISTS schedule_archive (
  archive_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit (
  audit_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  employee_id TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit(timestamp);

CREATE TABLE IF NOT EXISTS cars (
  car_id TEXT PRIMARY KEY,
  registration TEXT NOT NULL,
  make TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available',
  current_driver_id TEXT NOT NULL DEFAULT '',
  current_driver_name TEXT NOT NULL DEFAULT '',
  current_usage_id TEXT NOT NULL DEFAULT '',
  parked_location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  last_odometer REAL,
  last_oil_change_odometer REAL,
  last_oil_change_date TEXT NOT NULL DEFAULT '',
  fuel_cash_start REAL,
  fuel_spent_total REAL,
  -- Set when a car is auto-created (plate seen in the schedule with no matching fleet
  -- record) so an admin knows to fill in make/model/photo. Cleared on the next saveCar.
  needs_review INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS usage_history (
  usage_id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  registration TEXT NOT NULL DEFAULT '',
  employee_id TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL DEFAULT '',
  start_at TEXT NOT NULL DEFAULT '',
  end_at TEXT NOT NULL DEFAULT '',
  parked_location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  fuel_cash_start REAL,
  fuel_spent_total REAL,
  fuel_cash_remaining REAL,
  has_fire_extinguisher INTEGER NOT NULL DEFAULT 0,
  has_first_aid_kit INTEGER NOT NULL DEFAULT 0,
  has_warning_triangle INTEGER NOT NULL DEFAULT 0,
  has_safety_vest INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_usage_car ON usage_history(car_id);

CREATE TABLE IF NOT EXISTS maintenance (
  maintenance_id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  registration TEXT NOT NULL DEFAULT '',
  reported_by_id TEXT NOT NULL DEFAULT '',
  reported_by_name TEXT NOT NULL DEFAULT '',
  reported_at TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  severity TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'open',
  resolved_at TEXT NOT NULL DEFAULT '',
  resolved_by_id TEXT NOT NULL DEFAULT '',
  resolved_by_name TEXT NOT NULL DEFAULT '',
  repair_description TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  cost TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_maintenance_car ON maintenance(car_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance(status);

CREATE TABLE IF NOT EXISTS documents (
  document_id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  registration TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  document_number TEXT NOT NULL DEFAULT '',
  valid_from TEXT NOT NULL DEFAULT '',
  valid_until TEXT NOT NULL DEFAULT '',
  warning_days INTEGER NOT NULL DEFAULT 30,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_documents_car ON documents(car_id);

CREATE TABLE IF NOT EXISTS availability (
  availability_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  week_start TEXT NOT NULL,
  date TEXT NOT NULL,
  shift_type TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_availability_emp_week ON availability(employee_id, week_start);

CREATE TABLE IF NOT EXISTS orders (
  order_record_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  week_start TEXT NOT NULL,
  restaurant TEXT NOT NULL DEFAULT '',
  shift_type TEXT NOT NULL DEFAULT '',
  order_count REAL NOT NULL DEFAULT 0,
  order_salary REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT '',
  UNIQUE(employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_orders_week ON orders(week_start);

CREATE TABLE IF NOT EXISTS fuel_expenses (
  fuel_entry_id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL,
  registration TEXT NOT NULL DEFAULT '',
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  usage_id TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  week_start TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_fuel_week ON fuel_expenses(week_start);
CREATE INDEX IF NOT EXISTS idx_fuel_car ON fuel_expenses(car_id);
CREATE INDEX IF NOT EXISTS idx_fuel_usage ON fuel_expenses(usage_id);

CREATE TABLE IF NOT EXISTS daily_reports (
  report_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  week_start TEXT NOT NULL,
  restaurant TEXT NOT NULL DEFAULT '',
  delivery_type TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_reports_emp_date ON daily_reports(employee_id, date, restaurant);

CREATE TABLE IF NOT EXISTS payroll (
  payroll_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  week_start TEXT NOT NULL,
  base_salary REAL,
  orders_count REAL,
  orders_salary REAL,
  fuel_salary REAL,
  final_amount REAL,
  paid INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT NOT NULL DEFAULT '',
  paid_by_id TEXT NOT NULL DEFAULT '',
  paid_by_name TEXT NOT NULL DEFAULT '',
  received_confirmed INTEGER NOT NULL DEFAULT 0,
  received_confirmed_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  UNIQUE(employee_id, week_start)
);

-- Private dev changelog, visible only to the two named developer-admins (see
-- DEV_NOTE_ADMINS in lib/auth.js) — not even other admins can see this table's data
-- through the API (every route here is gated by requireDevNoteAccess, not requireAdmin).
CREATE TABLE IF NOT EXISTS dev_notes (
  note_id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  app_version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dev_notes_created ON dev_notes(created_at);
