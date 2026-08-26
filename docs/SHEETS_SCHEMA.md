# Google Sheets structure

The backend Apps Script is **bound to one spreadsheet** (the "Fleet App Data"
datastore). Each entity lives in its own tab. IDs are immutable and prefixed
(spec §59). Run `setup()` once to auto-create the tabs with the correct headers.

## Datastore tabs

| Tab | Columns |
|-----|---------|
| **Employees** | employee_id, name, role, pin_hash, active |
| **Locations** | location_id, name, address, latitude, longitude, active |
| **Sessions** | token, employee_id, created_at, expires_at |
| **Settings** | key, value |
| **Audit** | audit_id, timestamp, employee_id, employee_name, action, entity_type, entity_id, details |
| **Cars** | car_id, registration, make, model, year, image, status, current_driver_id, current_driver_name, current_usage_id, parked_location, notes, active |
| **UsageHistory** | usage_id, car_id, registration, employee_id, employee_name, start_at, end_at, parked_location, notes |
| **Maintenance** | maintenance_id, car_id, registration, reported_by_id, reported_by_name, reported_at, title, description, category, severity, status, resolved_at, resolved_by_id, resolved_by_name, repair_description, service, cost, notes |
| **Documents** | document_id, car_id, registration, type, provider, document_number, valid_from, valid_until, warning_days, notes |
| **Availability** | availability_id, employee_id, employee_name, week_start, date, shift_type, updated_at |

- `role`: `employee` \| `admin`; `pin_hash`: salted SHA-256 (never a plaintext PIN)
- Car `status`: `available` \| `in_use` \| `maintenance` \| `inactive`
- Settings keys: `app_name`, `current_schedule_sheet_url`, `schedule_tab_name`,
  `document_warning_days`, `timezone`, `full_shift_start/end`,
  `evening_shift_start/end`, `map_default_lat/lng`, `availability_open`,
  `availability_week_start`

## Locations & the map

The Home map matches schedule location names to `Locations` rows **by name**
(case-insensitive). For a marker to appear, the location must exist here **with
latitude/longitude**. The six current schedule locations are: Пирин, Гоце Делчев,
Черковна, Студентски град, Студентски град 2, Младост.

---

## Schedule source (separate, read-only sheet)

The weekly schedule is the real management grid — **not** a simple table. The
backend returns it verbatim via `getScheduleRaw` (a 2D matrix of display values);
the frontend parser (`src/services/schedule/parser.js`) normalizes it.

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
