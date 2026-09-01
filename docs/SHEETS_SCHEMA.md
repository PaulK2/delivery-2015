# Data model

The operational datastore is **D1** (SQL), schema in `worker/schema.sql`. IDs are
immutable and prefixed (`EMP-…`, `CAR-…`, …), generated the same way the app always has.

## D1 tables

| Table | Columns |
|-----|---------|
| **employees** | employee_id, name, role, password_hash, password_configured, active |
| **locations** | location_id, name, address, latitude, longitude, active |
| **sessions** | token, employee_id, created_at, expires_at |
| **settings** | key, value |
| **audit** | audit_id, timestamp, employee_id, employee_name, action, entity_type, entity_id, details |
| **cars** | car_id, registration, make, model, year, image, status, current_driver_id, current_driver_name, current_usage_id, parked_location, notes, active, last_odometer, last_oil_change_odometer, last_oil_change_date, fuel_cash_start, fuel_spent_total |
| **usage_history** | usage_id, car_id, registration, employee_id, employee_name, start_at, end_at, parked_location, notes, fuel_cash_start, fuel_spent_total, fuel_cash_remaining, has_fire_extinguisher, has_first_aid_kit, has_warning_triangle, has_safety_vest |
| **maintenance** | maintenance_id, car_id, registration, reported_by_id, reported_by_name, reported_at, title, description, category, severity, status, resolved_at, resolved_by_id, resolved_by_name, repair_description, service, cost, notes |
| **documents** | document_id, car_id, registration, type, provider, document_number, valid_from, valid_until, warning_days, notes |
| **availability** | availability_id, employee_id, employee_name, week_start, date, shift_type, updated_at |
| **orders** | order_record_id, employee_id, employee_name, date, week_start, restaurant, shift_type, order_count, order_salary, updated_at |
| **fuel_expenses** | fuel_entry_id, car_id, registration, employee_id, employee_name, usage_id, amount, date, week_start, created_at, notes |
| **daily_reports** | report_id, employee_id, employee_name, date, week_start, restaurant, delivery_type, amount, updated_at |
| **payroll** | payroll_id, employee_id, employee_name, week_start, base_salary, orders_count, orders_salary, fuel_salary, final_amount, paid, paid_at, paid_by_id, paid_by_name, received_confirmed, received_confirmed_at, updated_at |

- `role`: `employee` \| `admin`; `password_hash`: salted SHA-256 (never a plaintext
  password) — hashed the same way in the Worker (Web Crypto) as it always was in Apps
  Script, using the `PIN_SALT` secret.
- Booleans are stored as `INTEGER` (0/1). Dates/timestamps are `TEXT` ISO strings
  (`yyyy-MM-dd` / `yyyy-MM-ddTHH:mm:ss`), Sofia-local.
- Car `status`: `available` \| `in_use` \| `maintenance` \| `inactive`
- Settings keys in use: `app_name`, `current_schedule_sheet_url`, `schedule_tab_name`,
  `document_warning_days`, `timezone`, `map_default_lat/lng`, `availability_open`,
  `availability_week_start`. (A few legacy shift-time keys may also be present from the
  old Sheets datastore — unused; shift times are hardcoded in `src/config/index.js`.)

## Locations & the map

The Home map matches schedule location names to `locations` rows **by name**
(case-insensitive). For a marker to appear, the location must exist here **with
latitude/longitude**. The six current schedule locations are: Пирин, Гоце Делчев,
Черковна, Студентски град, Студентски град 2, Младост.

---

## Schedule source (separate, read-only sheet)

The weekly schedule is the real management grid — **not** a simple table. The Worker
fetches it via Google's public CSV export and returns it as a 2D matrix of display
values, unparsed (`getScheduleRaw`); the frontend parser
(`src/services/schedule/parser.js`) normalizes it.

> The Worker fetches `/export?format=csv&gid=...` specifically, **not** the
> `gviz/tq?tqx=out:csv` endpoint — the latter auto-detects multi-row frozen headers
> (this sheet has 2: the location-name row + the СЛУЖИТЕЛИ/СМЯНА/КОЛИ sub-header row)
> and silently flattens them into one row, shifting the rest of the grid up by one and
> breaking the parser below. `/export` is a literal export and matches what
> `SpreadsheetApp` sees exactly (verified by diffing the two against the live sheet).

### Grid format

- **Row 1** — `ДАТА` in column A, then a **location name** at each block-start
  column (Пирин, Гоце Делчев, Черковна, Студентски град, Студентски град 2, Младост).
- **Row 2** — repeated sub-headers under each location: **СЛУЖИТЕЛИ** (employee) /
  **СМЯНА** (payment) / **КОЛИ** (car). Each location block spans 3 columns + 1 spacer.
- **Row 3+** — one **segment per calendar day**:
  - a **day-of-month number** (e.g. `24`) heads the **day / full-shift** rows,
  - a **weekday name** (`ПОНЕДЕЛНИК`…`НЕДЕЛЯ`) heads the **evening-shift** rows.
- **Last row** — `ОБЩО`: weekly payment totals per location (ignored by the parser).

### How it is interpreted

- **СМЯНА is the shift *payment*** (spec §57 `shift_payment`), not the shift type.
  The `ОБЩО` row sums each location's СМЯНА column.
- **Shift type** (`full` / `evening`) comes from which block a row sits in.
- Entries are normalized **by weekday** (0=Sun…6=Sat), so the Home map matches
  "who works where on date X" by X's weekday — no month/year needed.

Normalized entry: `{ weekday, day_number, location_name, employee_name,
shift_type, shift_start, shift_end, payment, car }`.
