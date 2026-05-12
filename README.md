# Lender Finder

A faceted-search tool for ILL staff to identify high-performing lender libraries, discover new candidates, and look up their OCLC policies (fees, materials, contact, hours).

The site is a static GitHub Pages app. For OCLC policy lookup, it talks to a small companion proxy backend (`lender-finder-backend`) that holds the WSKey credentials.

## What it does

**Rankings tab** — Upload OCLC Borrower Transaction-Level Detail reports (one or many months). The app merges them with fill-count-weighted turnaround, scores each lender on speed, fill rate, volume, consistency, and same-state preference, and exports the selected lenders as an OCLC Custom Holdings Group symbol string.

**Discover tab** — Search a directory of potential lender libraries by state, type, group affiliation, distance from your library, and free-text. Toggle "only libraries I haven't borrowed from" to surface true new candidates. Click "Load policies from OCLC" on any card to fetch live policy data (fees, materials lent, delivery methods, contact info, hours, loan terms).

Both tabs export to the same OCLC Custom Holdings Groups paste format.

## Three ways to run

| Mode | Setup | What you get |
|------|-------|--------------|
| **Frontend only** | Just deploy to GitHub Pages | Rankings + Discover with bundled directory and CSV imports. No live policy data. |
| **Frontend + backend** | Deploy Pages + the proxy backend | Everything above + live OCLC policy lookup on every Discover card. |
| **Local dev** | `python3 -m http.server` in this folder | Same as frontend-only, but on `localhost`. |

Start with frontend-only. Add the backend when you've requested an OCLC WSKey.

## Deploy to GitHub Pages (frontend)

1. Create a GitHub repo. Push these files to `main`:

   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
   git push -u origin main
   ```

2. In the repo, **Settings → Pages → Source: GitHub Actions**.

3. The workflow at `.github/workflows/pages.yml` builds and publishes automatically. Site URL: `https://YOUR-USER.github.io/YOUR-REPO/`.

Pushes to `main` redeploy automatically.

## Deploy the proxy backend (optional, for policy lookup)

See the companion `lender-finder-backend` project. Quick path:

1. Get an OCLC WSKey with scopes for Library Profiles + ILL Policies Directory APIs.
2. Deploy the backend to Render, Fly.io, or any container host (Dockerfile included). Free tiers work fine.
3. Set `OCLC_WSKEY`, `OCLC_SECRET`, and `ALLOWED_ORIGIN=https://YOUR-USER.github.io` in the backend's environment.
4. In the Lender Finder site → Discover tab → paste the backend URL into "Proxy backend URL". Health check runs automatically.

## Project structure

```
.
├── index.html              the page (Rankings + Discover tabs)
├── styles.css              styling (light + dark mode)
├── app.js                  parsers, scoring, rendering, storage, backend calls
├── lenders-directory.json  starter directory of US ILL lenders
├── directory-template.csv  blank template for staff to fill out
├── .nojekyll               tells Pages to skip Jekyll processing
└── .github/workflows/
    └── pages.yml           auto-deploy on push to main
```

## Building out the directory

The bundled `lenders-directory.json` is small (~24 verified entries). For real use, grow the directory with sources you trust:

- **Past OCLC Lender Detail reports** (libraries that borrowed from you — confirmed active suppliers).
- **OCLC Policies Directory web interface** — browse by state, group, or service area.
- **Consortium rosters** — ASERL, LVIS, ERG, regional networks.
- **Peer institutions** — ask an ILL coordinator at another library to share theirs.

CSV format (header row required):

```csv
symbol,name,state,type,groups,lat,lng
FUG,University of Florida,FL,Academic,ASERL,29.6516,-82.3248
FDA,Florida State University,FL,Academic,ASERL;LVIS,30.4419,-84.2985
```

- `groups` is semicolon-separated when a library belongs to several.
- `lat`/`lng` are optional but enable distance filtering.
- `type` values that match OCLC: Academic, Public, Special, Federal/Natl Government, State Library, Major Academic Research, Corporate, Theological, Other.

Upload in the Discover tab → **Import directory CSV**. Imports merge with the bundled list and persist in localStorage.

## How staff use it day-to-day

**To rank existing lenders:**
1. Run the OCLC **Borrower Transaction-Level Detail Report — Institution** for the months you want.
2. Drop reports into the Rankings tab → **Add Borrower report**.
3. Adjust weights, filter, sort. Tick lenders, **Build holdings group**, **Copy symbols**.
4. Paste into OCLC Service Configuration → WorldShare ILL → Custom Holdings Groups.

**To find new candidates:**
1. Switch to **Discover**.
2. Optionally import a directory CSV to expand the bundled list.
3. Filter by state, type, group, distance, search by name.
4. **Only libraries I haven't borrowed from** hides existing relationships (on by default).
5. With the backend configured: click **Load policies from OCLC** on any card to see fees, materials lent, contact, hours.
6. Tick promising lenders, build a holdings group, paste into OCLC.

## What it does and doesn't do

**Does:**
- Parse OCLC Borrower reports natively.
- Merge multiple months with fill-count-weighted turnaround.
- Score on speed, fill rate, volume, consistency, same-state.
- Distance filtering using haversine math.
- Free-text search and group-affiliation filtering across the directory.
- Live OCLC policy lookup when paired with the backend.
- Export symbol strings ready to paste into OCLC.
- Save everything to localStorage.

**Doesn't:**
- Sync between browsers (each browser's localStorage is independent — use **Download ranked CSV** to share).
- Update the bundled directory automatically (it's a JSON file in this repo; update via PR or override locally via CSV import).
- Make OCLC API calls directly from the browser — that would expose credentials. Live policy lookup goes through the companion proxy backend.

## Privacy

Reports and directory entries are processed client-side. The static site has no analytics, no third-party calls, and no upload-to-server step.

The only network requests:
- `styles.css`, `app.js`, `lenders-directory.json` from GitHub Pages
- `/api/policies/*` from your configured backend URL (if set)

Clearing browser data wipes stored reports and imported directory entries. The bundled directory reloads on next visit.

## License

Pick one that suits your institution and add a `LICENSE` file. MIT works for most libraries.
