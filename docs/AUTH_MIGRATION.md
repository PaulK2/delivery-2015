# Auth & Admin Migration — run once

This release moves authentication from shared PINs to **per-user passwords** and
replaces the generic `Администратор` account with **real named admins**. The frontend
(Cloudflare) rebuilds automatically on push, but the **Apps Script backend must be
redeployed manually**, and a one-time migration run.

## Steps

1. **Open** the Fleet App Data spreadsheet → **Extensions → Apps Script**.
2. **Paste** the updated `backend/Backend.gs` over the existing script and **Save**.
3. **Deploy → Manage deployments → Edit → New version → Deploy** (same Web App URL —
   the frontend keeps pointing at the existing `/exec`).
4. In the Apps Script editor, select **`migrateAdminsAndAuth`** and **Run** once
   (approve permissions if asked). It is idempotent — safe to re-run. It:
   - adds the `password_hash` / `password_configured` columns if missing;
   - forces **every** user to set a personal password on next login (no shared
     default survives);
   - gives the `admin` role to **ЦЕЦО, СИМО, ПАВЕЛ, В. ПЕТКОВ**, creating **ЦЕЦО**
     and **СИМО** if they don't exist;
   - **deactivates + demotes** the generic `Администратор` account.
5. Check the execution **log** for the "Promoted/Created/Retired" lines.

## What users see next

- Each user picks their name → because no password is configured yet, they get the
  **"Създайте парола"** (create + confirm) screen → they're logged in and that
  password is saved (as a salted SHA-256 hash) for all future logins.
- Sessions persist on the device via the existing token; the password is only used
  when authenticating, never stored in the browser.

## Password reset (admin)

Administration → Служители → **Нулирай парола**. This clears the user's hash, marks
the account as needing setup, and invalidates their sessions — the user sets a new
password on next login. Admins never see or set another user's password.

## Notes

- Existing employee **IDs and history are preserved** — rows are updated in place.
- The legacy `pin_hash` column is left untouched (unused) on already-deployed sheets.
- Admins **cannot** submit their own shift availability — enforced in the backend
  (`saveAvailability` returns `admin_no_availability`), not just hidden in the UI.
- Hashing reuses the existing global-salt SHA-256 scheme for consistency with the
  codebase. A per-user salt / stronger KDF would be a reasonable future hardening.
