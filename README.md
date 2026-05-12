# Lender Finder

A faceted-search tool for ILL staff to identify high-performing lender libraries, discover new candidates, look up their OCLC policies, and keep institutional knowledge across months. Pure static frontend — works offline once loaded.

The site is a static GitHub Pages app. For OCLC policy lookup, it talks to a small companion proxy backend (`lender-finder-backend`) that holds the WSKey credentials.

## What it does

**Rankings tab** — Upload OCLC Borrower Transaction-Level Detail reports (one or many months). The app merges them with fill-count-weighted turnaround, scores each lender on speed, fill rate, volume, consistency, and same-state preference, and exports the selected lenders as an OCLC Custom Holdings Group symbol string. Sparklines show fill-rate trend across months. Compare any two date ranges side-by-side to see who's improving or regressing.

**Discover tab** — Search a directory of potential lender libraries by state, type, group affiliation, distance from your library, and free-text. Toggle "only libraries I haven't borrowed from" to surface true new candidates. Click "Load policies from OCLC" on any card (or bulk-fetch for all selected) to pull live policy data — fees, materials lent, delivery methods, contact info, hours, loan terms. Optional **map view** plots filtered candidates as pins.

Both tabs:
- Export to the OCLC Custom Holdings Groups paste format.
- Let you **save a named selection** that you can reload or update next month.
- Let you **attach a free-text note** to any lender (preferences, contacts, fees, anything).

## Three ways to run

| Mode | Setup | What you get |
|------|-------|--------------|
| **Frontend only** | Deploy to GitHub Pages | Rankings + Discover with bundled directory, CSV imports, sparklines, comparison, map view, notes, saved groups. Works offline. No live policy data. |
| **Frontend + backend** | Deploy Pages + the proxy backend | Everything above + live OCLC policy lookup (individual or bulk) on every Discover card. |
| **Local dev** | `python3 -m http.server` in this folder | Same as frontend-only, but on `localhost`. |

Start with frontend-only. Add the backend when you've requested an OCLC WSKey.

## Features

### Core
- OCLC Borrower report parsing (multi-month merge, fill-weighted turnaround)
- Configurable scoring weights with presets (Balanced / Speed first / Trusted)
- Faceted filters: type, state, group, distance, history filters
- Composite score with per-metric breakdown
- Custom Holdings Group export (clipboard, .txt, ranked CSV, print)

### Workflow
- **Saved holdings groups** — name a selection, reload or update it next month
- **Lender notes** — free-text per OCLC symbol, persists across sessions
- **Sparklines** — fill-rate trend per lender once 3+ months are loaded
- **Compare periods** — pick two month ranges, see deltas with up/down indicators
- **Bulk policy fetch** — pull OCLC policies for all selected candidates in parallel
- **Session export/import** — share an entire working session with a colleague as a JSON file
- **Sample data** — first-run "Try with sample data" so you can explore before uploading

### UX
- Drag-and-drop file upload
- Active filter chips with one-click removal
- Bulk selection (top 10 / select all / clear)
- Filter preview before applying a directory CSV import
- Undo toast for destructive actions
- Map view (Leaflet, lazy-loaded)
- Print stylesheet
- Keyboard shortcuts (1/2 to switch tabs, `/` to search, Esc to close, ? for help)

### Quality
- Fully accessible (WCAG): semantic landmarks, focus trap in modals, skip link, ARIA live region, ≥28px touch targets
- Mobile-first responsive (sidebar collapses to a "Filters" toggle on small screens)
- Dark mode (auto, honors `prefers-color-scheme`)
- Reduced-motion safe
- Offline-ready PWA (service worker caches the shell)
- Browser-runnable test suite (`tests.html`)
- CI workflow validates JS syntax, directory JSON, and runs tests headless

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
├── styles.css              styling (light + dark mode, print, mobile)
├── app.js                  parsers, scoring, rendering, storage, backend calls
├── lenders-directory.json  starter directory of US ILL lenders (47 entries)
├── directory-template.csv  blank template for staff to fill out
├── tests.html              browser-runnable test suite (open in any browser)
├── sw.js                   service worker (offline shell cache)
├── manifest.webmanifest    PWA manifest
└── .github/workflows/
    ├── pages.yml           auto-deploy on push to main
    └── ci.yml              syntax + JSON + test validation
```

## Building out the directory

The bundled `lenders-directory.json` is a small, conservatively-verified starter (~47 entries). For real use, grow the directory with sources you trust:

- **OCLC Policies Directory** (https://illpolicies.oclc.org/) — canonical source for symbols, contacts, fees.
- **Past OCLC Lender Detail reports** — every library that borrowed from you is a confirmed active supplier.
- **Consortium rosters** — ASERL, LVIS, BTAA, GWLA, regional networks.
- **Peer institutions** — ask an ILL coordinator at another library to share theirs.

CSV format (header row required):

```csv
symbol,name,state,type,groups,lat,lng
FUG,University of Florida,FL,Academic,ASERL,29.6516,-82.3248
FDA,Florida State University,FL,Academic,ASERL;LVIS,30.4419,-84.2985
```

- `groups` is semicolon-separated when a library belongs to several.
- `lat`/`lng` are optional but enable distance filtering and map view.
- `type` values that match OCLC: Academic, Public, Special, Federal/Natl Government, State Library, Major Academic Research, Corporate, Theological, Other.

Upload in the Discover tab → **Import directory CSV**. A preview shows new vs. updated vs. bundled-overrides before you commit. Imports merge with the bundled list and persist in localStorage.

## How staff use it day-to-day

**To rank existing lenders:**
1. Run the OCLC **Borrower Transaction-Level Detail Report — Institution** for the months you want.
2. Drop reports into the Rankings tab → **Add Borrower report**.
3. Adjust weights, filter, sort. Tick lenders, **Build holdings group**, **Save** for next month.
4. **Copy symbols** and paste into OCLC Service Configuration → WorldShare ILL → Custom Holdings Groups.

**To find new candidates:**
1. Switch to **Discover**.
2. Optionally import a directory CSV to expand the bundled list.
3. Filter by state, type, group, distance, or search by name.
4. **Only libraries I haven't borrowed from** hides existing relationships (on by default).
5. With the backend configured: bulk-load policies for all selected. Review fees, materials, contact, hours.
6. Tick promising lenders, build a holdings group, paste into OCLC.

**To track changes over time:**
1. After loading 2+ months, click **Compare periods** in the Rankings toolbar.
2. Pick months for Period A (baseline) and Period B (the new period).
3. See per-lender deltas: improving, declining, newly appearing, dropped off.
4. Download as CSV for reporting.

**To hand a session to a colleague:**
1. Click **Export session** in the footer.
2. Email or share the JSON file.
3. Colleague clicks **Import session** and chooses Merge or Replace.

## Running the tests

Open `tests.html` in any browser. The page title and a colored banner show pass/fail counts. Tests cover the OCLC report parser, the directory CSV parser, the scoring math, distance math, the multi-month merge, and the sparkline renderer.

CI runs the same tests headless via Playwright on every push and PR.

## Privacy

Reports and directory entries are processed client-side. The static site has no analytics, no third-party tracking, and no upload-to-server step.

The only network requests:
- `styles.css`, `app.js`, `lenders-directory.json` from GitHub Pages (cached offline by the service worker)
- `/api/policies/*` from your configured backend URL (if set)
- `unpkg.com` (Leaflet) and `tile.openstreetmap.org` (OSM tiles), but **only** when the map view is toggled on

Clearing browser data wipes stored reports, notes, saved groups, and imported directory entries. The bundled directory reloads on next visit.

## License

Pick one that suits your institution and add a `LICENSE` file. MIT works for most libraries.
