# Lender Finder — React + Shadcn rebuild

A parallel rebuild of the vanilla `/app.js` + `/index.html` PWA using
Vite + React + TypeScript + Tailwind + shadcn/ui (New York style).

The vanilla app at the repo root **keeps working** during this
migration. Once this version reaches feature parity we'll switch the
GitHub Pages workflow to deploy `web/dist/` instead.

## Status

| Surface             | Status      |
| ------------------- | ----------- |
| Vite + TS + Tailwind scaffold | done |
| Shadcn theme tokens + base CSS | done |
| Shell: Header / Tabs / Footer | done |
| Core UI primitives (Button, Card, Tabs, Input, Label, Badge, Separator) | done |
| Rankings tab           | placeholder |
| Discover tab           | placeholder |
| Audit tab              | placeholder |
| OCLC report parser       | not ported |
| Scoring engine          | not ported |
| State persistence       | not ported |
| Service worker / PWA    | not ported |

## Run

```sh
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to web/dist/
```

`vite.config.ts` points `publicDir` at the repo root so the existing
`lvis-policies.json`, `film-policies.json`, etc. (and
`lenders-directory.json`) are served as-is during dev and copied into
`dist/` on build — no need to duplicate them.

## What we keep, what we rebuild

- **Keep (port verbatim)**: the OCLC report parser, scoring math
  (`totalScore`, `subscores`), audit tier rules, geocoding distance
  helpers, group affiliation whitelist. These are pure functions; they
  drop into `src/lib/` with minimal change.
- **Rebuild** (using shadcn/Radix instead of custom DOM): tabs, modals,
  dropdowns, tooltips, filter chips, the score sliders. The visible
  polish lives here.

## Why a rebuild?

The vanilla app shipped 30+ commits of iterative UX work, and the
custom CSS does a lot right (focus rings, dark mode, responsive
breakpoints, contrast tuning). But the per-component rebuild on top of
shadcn primitives buys consistent motion easing, refined typography,
and a faster path for new UI surfaces — and it's a one-time cost.
