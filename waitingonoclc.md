# OCLC integration — current state

**You are no longer blocked on OCLC.** The proxy was refactored so it does
not need the Library Profiles API. Everything works with the
`policiesDirectoryAPI` scope your existing WSKey already has.

## What changed

`main.py` used to do a two-step call:

1. Library Profiles → translate OCLC symbol → registryId (this hit a 403
   on our scope, and Library Profiles is a paid add-on)
2. Policies Directory → fetch fees, hours, contact, etc. by registryId

The refactor introduces a **local override map** (`symbol-registry.json`)
that holds `OCLCSymbol → registryId` pairs. The proxy reads that file first
and skips the Library Profiles call entirely. Look up registryIds for free
on the OCLC ILL Policies Directory website
([policies.oclc.org](https://policies.oclc.org/)) — no API key needed.

The Policies Directory itself does **not** expose a symbol-search endpoint
(we tried `/institutions`, `/institution`, `/serviceInstitution`,
`/servicePolicyInstitution`, `/searchInstitutions`,
`/institution/{symbol}`, and the Americas Discovery alias — all 404). So
the local map is the only realistic bypass, and it's good enough: registryIds
don't change, so seeding is a one-time cost per library.

## Day-to-day workflow

1. **Discover candidate libraries:** Discover tab in the frontend already
   works without any OCLC API call — it runs on `lenders-directory.json`
   plus any CSV you import.

2. **When you want live OCLC policies for a specific lender:**

   1. Go to <https://policies.oclc.org/>, search for the OCLC symbol
      (e.g. `FUG`).
   2. Open the institution page; its registryId appears in the URL
      (e.g. `…/policies/INST/12345`).
   3. Pin it locally:
      ```bash
      python scripts/add_registry.py FUG 12345
      ```
   4. Reload the policy panel in the frontend — it'll fetch fees, hours,
      contact, materials, delivery from OCLC using just your
      `policiesDirectoryAPI` scope.

   You can pass multiple pairs at once:
   ```bash
   python scripts/add_registry.py FUG 12345 NTD 67890 CGU 24680
   python scripts/add_registry.py --list           # see the current map
   python scripts/add_registry.py --remove FUG     # delete an entry
   ```

3. **If you ever do get Library Profiles access** (paid), add the scope
   to `.env`:
   ```
   OCLC_SCOPES=policiesDirectoryAPI WorldCatRegistry
   ```
   The resolver will fall back to Library Profiles automatically whenever
   a symbol isn't in `symbol-registry.json` — best of both worlds.

## Verifying

```bash
cd /workspaces/oclc-lender-finder
uvicorn main:app --reload --port 8000 &
curl -s "http://localhost:8000/api/policies/search?q=florida" | jq      # local fallback
python scripts/add_registry.py FUG <registryId-from-policies.oclc.org>
curl -s http://localhost:8000/api/policies/FUG | jq                     # live OCLC fetch
```

Expect every `servicePolicy/{rid}/*` call to return `HTTP 200`. If a field
in the response is `null`, that's a mapping question, not an auth one —
look at the raw probe output for that registryId and adjust the `_map_*`
functions in `main.py`:

```bash
python scripts/probe_oclc.py FUG
```

## Files involved

- `main.py` — `_resolve_registry_id` is the new entry point. It checks the
  override file, then Policies Directory paths, then optionally Library
  Profiles. `/api/policies/{symbol}` and `/api/policies/search` both use it.
- `symbol-registry.json` — your local OCLCSymbol → registryId map.
  Tracked but starts effectively empty (just a help comment).
- `scripts/add_registry.py` — CLI to add/remove/list entries.
- `scripts/probe_oclc.py` — raw response inspector, useful for tuning the
  `_map_*` functions when an OCLC field comes back `null`.
- `lenders-directory.json` — bundled local directory; powers Discover-tab
  search and the proxy's `/api/policies/search` fallback. Extend by
  importing a CSV through the frontend, or by editing this file directly.

## Why NOT pay for Library Profiles

- Discover-tab search runs entirely on local data — no OCLC call needed.
- Policy fetches work as soon as you pin the lender's registryId locally,
  which is a one-time free lookup at policies.oclc.org.
- The set of libraries you actually ILL with is small (dozens, not
  thousands). Seeding is cheap.

If you find yourself needing to search OCLC's full registry of libraries by
arbitrary name/state — i.e. discovery, not policy lookup — *that* is what
Library Profiles is good for, and only then is it worth paying. But the
app's Discover tab already covers that use case via local data + your
imported CSVs.
