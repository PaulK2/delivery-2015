# Google Sheets structure

The backend Apps Script is **bound to one spreadsheet** (the data layer). Each entity
lives in its own tab. IDs are immutable and prefixed (spec §59) — never rely on row
numbers as identity.

Run the `setup()` function once from the Apps Script editor to auto-create the core
tabs with the correct headers and seed a first admin.

## Employees
| employee_id | name | role | pin_hash | active |
|-------------|------|------|----------|--------|
| EMP-a1b2c3 | Иван Петров | employee | *(sha-256 hash)* | TRUE |

- `role`: `employee` or `admin`
- `pin_hash`: set via the `setPin()` / `addEmployee()` helpers — **never type a PIN here directly**
- `active`: `TRUE` / `FALSE`

## Locations
| location_id | name | address | latitude | longitude | active |
|-------------|------|---------|----------|-----------|--------|
| LOC-a1b2c3 | Сердика | бул. Тодор Александров 1 | 42.6977 | 23.3219 | TRUE |

Latitude/longitude place the orange marker on the Sofia map.

## Sessions
| token | employee_id | created_at | expires_at |
Managed automatically by the backend (login/logout). Do not edit by hand.

## Settings
| key | value |
Keys (spec §58): `app_name`, `current_schedule_sheet_url`, `schedule_tab_name`,
`document_warning_days`, `timezone`, `full_shift_start`, `full_shift_end`,
`evening_shift_start`, `evening_shift_end`, `map_default_lat`, `map_default_lng`,
`availability_open`, `current_week_start`, `availability_week_start`.

## Audit
| audit_id | timestamp | employee_id | employee_name | action | entity_type | entity_id | details |
Append-only log of important actions (spec §63).

---

## Schedule source (separate spreadsheet)

The weekly schedule is a **separate** Google Sheet whose URL an admin sets in-app
(**График → Google Sheet за текущия график**). Expected first-tab layout (spec §57):

| date | day | restaurant | person | shift type | shift_payment |
|------|-----|------------|--------|------------|---------------|
| 27.08.2026 | Сряда | Сердика | Иван Петров | full | 60 |

- `date`: `DD.MM.YYYY` or `YYYY-MM-DD`
- `restaurant`: matched to a Location by name (or set a `location_id` column to match by id)
- `person`: employee name shown at the location
- `shift type`: `full` / `evening` (Bulgarian aliases like `цяла` / `вечерна` also accepted)

The account that deployed the Apps Script must have read access to this spreadsheet.

## Phase 2+ tabs (created as those features are built)
`Cars`, `UsageHistory`, `Maintenance`, `Documents`, `Availability` — see the build
spec sections §35, §45, §50, §18 for their column models.
