# Setup guide

Two halves: the **backend** (Google Sheets + Apps Script) and the **frontend**
(this Vite/React app on GitHub Pages).

## 1. Backend — Google Sheets + Apps Script

1. Create a new Google Spreadsheet (this becomes the data layer).
2. **Extensions → Apps Script**. Delete the default `Code.gs`.
3. Add every file from this repo's `backend/` folder as a matching `.gs` file
   (`Code.gs`, `Config.gs`, `Utils.gs`, `Auth.gs`, `Locations.gs`, `Schedule.gs`, `Setup.gs`).
4. In `Config.gs`, set `PIN_SALT` to a long random secret string.
5. Run the `setup()` function once (select it in the editor, click **Run**, grant
   permissions when prompted). This creates the tabs, seeds Settings, and creates a
   first admin (`Администратор`, PIN `1234`).
6. Change the admin PIN: in `Setup.gs`, set the constants in `setPin()` and Run it.
   Add real employees with `addEmployee()`.
7. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, then copy the **Web app URL** (ends in `/exec`).

> Re-deploy (New deployment, or Manage deployments → edit → new version) whenever you
> change backend code, so the live URL serves the latest version.

## 2. Frontend — local development

```bash
npm install
cp .env.example .env.local   # put your /exec URL in VITE_API_URL
npm run dev
```

Open the printed localhost URL. Log in with an employee + PIN.

> If you don't set `VITE_API_URL`, log in as admin and set the backend URL in-app
> once the Administration screen lands — for now it can be injected via
> `localStorage.setItem('fv_api_url', '<your /exec url>')` in the browser console.

## 3. Deploy the frontend to GitHub Pages

1. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. (Optional) Bake the backend URL in at build time: **Settings → Secrets and
   variables → Actions → Variables**, add `VITE_API_URL`.

### Custom domain
Put a `CNAME` file containing your domain in `public/` (Vite copies it into the
build), and configure the domain under **Settings → Pages → Custom domain**.

## Notes
- The Apps Script Web App URL is **not** a secret; secrets (`PIN_SALT`, PIN hashes)
  stay inside Apps Script and never reach the browser.
- CORS: the frontend sends `text/plain` POST bodies so the browser skips the preflight
  that Apps Script Web Apps do not answer.
