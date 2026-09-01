# Auth & Admin Migration — run once (historical)

> **Superseded.** This describes the PIN→password migration on the old Apps Script
> backend (`backend/Backend.gs`), which is now dormant — the app runs on a Cloudflare
> Worker + D1 instead (see [SETUP.md](SETUP.md)). Every password hash from that backend
> was carried over during the D1 migration (same salted-SHA-256 algorithm, same
> `PIN_SALT`), so no user had to reset anything. Kept here for historical context only.

**Every user has a personal password (min 6 characters), created on first login.** This
release also replaces the shared `Администратор` account with **real named admins**. The
frontend (Cloudflare) rebuilds automatically on push, but the **Apps Script backend must
be redeployed manually**, and a one-time migration run.

## Steps

1. **Open** the Fleet App Data spreadsheet → **Extensions → Apps Script**.
2. **Paste** the updated `backend/Backend.gs` over the existing script and **Save**.
3. **Deploy → Manage deployments → Edit → New version → Deploy** (same Web App URL —
   the frontend keeps pointing at the existing `/exec`).
4. In the Apps Script editor, select **`migrateAdminsAndAuth`** and **Run** once
   (approve permissions if asked). It is idempotent — safe to re-run. It:
   - adds the `password_hash` / `password_configured` columns if missing;
   - gives the `admin` role to **ЦЕЦО, СИМО, ПАВЕЛ, В. ПЕТКОВ, Маги**, creating
     **ЦЕЦО**, **СИМО** and **Маги** if they don't exist;
   - **deactivates + demotes** the generic `Администратор` account.

   **Re-run this after deploying the updated `Backend.gs`** to create **Маги** as a
   new full admin (same rights as ЦЕЦО — review-only, not a worker-admin). She gets
   no password yet, so her first login goes through the normal "Създайте парола" setup.
   It does NOT wipe passwords: a user with no password (blank flag) is taken through
   first-login setup automatically; anyone who already set one keeps it.
5. Check the execution **log** for the "Promoted/Created/Retired" lines.

## What users see next

- **Every user:** pick their name → because no password is configured yet, they get
  the **"Създайте парола"** (create + confirm, min 6 chars) screen → they're logged in
  and that password is saved (as a salted SHA-256 hash) for all future logins.
- After that: pick name → enter password → **Вход**.
- Sessions persist on the device via the existing token; the password is only used
  when authenticating, never stored in the browser. A temporary backend hiccup never
  clears the password or forces setup again.

## Password reset (admin)

Administration → **Пароли** (Управление на пароли) shows each user's password status
(configured / not configured — never the hash) with **Нулирай паролата**. Reset clears
the user's hash, marks the account as needing setup, and invalidates their sessions — the
user creates a new password on next login. Enforced admin-only on the backend. Admins
never see or set another user's password.

## Notes

- Existing employee **IDs and history are preserved** — rows are updated in place.
- The legacy `pin_hash` column is left untouched (unused) on already-deployed sheets.
- Admins **cannot** submit their own shift availability — enforced in the backend
  (`saveAvailability` returns `admin_no_availability`), not just hidden in the UI.
- Hashing reuses the existing global-salt SHA-256 scheme for consistency with the
  codebase. A per-user salt / stronger KDF would be a reasonable future hardening.
