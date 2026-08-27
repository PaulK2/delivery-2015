# Setup guide

Two halves: the **backend** (Google Sheets + Apps Script) and the **frontend**
(this Vite/React app on GitHub Pages).

## 1. Backend — Google Sheets + Apps Script

The backend is a single file: **`backend/Backend.gs`**. It is bound to one
spreadsheet (the "Fleet App Data" datastore) and reads a **separate, read-only**
management schedule sheet.

1. Create a new Google Spreadsheet — this becomes the datastore.
2. **Extensions → Apps Script**. Delete the default `Code.gs`.
3. Create a file and paste all of `backend/Backend.gs` into it. Save.
4. Run the **`setup()`** function once (select it, click **Run**, grant
   permissions). It:
   - stores the datastore spreadsheet id in Script Properties,
   - generates a random `PIN_SALT` in Script Properties (never in the frontend/repo),
   - creates every tab (Employees, Locations, Sessions, Settings, Audit, Cars,
     UsageHistory, Maintenance, Documents, Availability),
   - seeds default Settings and a first admin: **`Администратор` / PIN `1234`**.
5. Change the admin PIN and add employees (`setEmployeePinManual()` helper, or the
   `saveEmployee` / `resetEmployeePin` admin API once the Admin UI lands).
6. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**  ← the "even anonymous" option; required so the
     browser can call it without a Google login.
   - Deploy, then copy the **Web app URL** (ends in `/exec`).

> Re-deploy (Manage deployments → edit → new version) after any backend change so
> the live `/exec` URL serves the latest code.

### Schedule source
The weekly schedule is a **separate** Google Sheet. Set it either in-app
(**График → Google Sheet за текущия график**, admin only) or by editing
`INITIAL_SCHEDULE_URL` / running `setTestScheduleUrl()`. The deploying account must
have **read** access to that sheet. The app **never writes** to it. See
[SHEETS_SCHEMA.md](SHEETS_SCHEMA.md) for the grid format the parser expects.

## 2. Frontend — local development

```bash
npm install
cp .env.example .env.local   # put your /exec URL in VITE_API_URL
npm run dev
```

Open the printed localhost URL and log in (employee + PIN).

> The Apps Script URL can also be overridden at runtime:
> `localStorage.setItem('fv_api_url', '<your /exec url>')` in the browser console.

## 3. Deploy the frontend to GitHub Pages

1. Push to `main`; `.github/workflows/deploy.yml` builds and deploys.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. (Optional) Bake the backend URL in at build time: **Settings → Secrets and
   variables → Actions → Variables**, add `VITE_API_URL`.

### Custom domain
Put a `CNAME` file with your domain in `public/` and set it under
**Settings → Pages → Custom domain**.

## 4. Deploy the frontend to Cloudflare (static assets)

The Cloudflare deployment serves the Vite build as static assets — there is no
Worker API layer. It rebuilds from `main` on every push. Because `.env.local` is
git-ignored, the committed **`.env.production`** file supplies `VITE_API_URL` at
build time so the production bundle talks to the same Apps Script `/exec` backend
as local dev. Update the URL there if the Apps Script deployment ID changes.

> Prefer a Cloudflare **build-time environment variable** (`VITE_API_URL`) in the
> dashboard when available — it takes precedence over `.env.production`, which is
> the fallback. The `/exec` URL is not a secret; auth stays inside Apps Script.

## Notes
- Secrets (`PIN_SALT`, PIN hashes) live only in Apps Script Script Properties —
  never in the browser or the repo. The `/exec` URL itself is not a secret.
- CORS: the frontend sends `text/plain` POST bodies so the browser skips the
  preflight that Apps Script Web Apps do not answer.
