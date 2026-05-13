# Waiting on OCLC — context for resuming when the new WSKey arrives

Status: **blocked on OCLC issuing a new WSKey with Library Profiles entitlement.**

## What happened

Current `.env` WSKey works for the OAuth token exchange but the proxy can't get past the symbol → registryId step.

```
$ python scripts/probe_oclc.py FUG
==> requesting token (scopes='policiesDirectoryAPI', context=8995)
token status: 200
...access_token obtained...

==> brief-institutions: GET https://discovery.api.oclc.org/library-profiles/brief-institutions?oclcSymbol=FUG&limit=1
status: 403 ct: application/json; charset=utf-8
{"message":"Forbidden"}

==> registryId resolved: None
Cannot resolve registryId; stopping.
```

`curl http://localhost:8000/api/policies/FUG` returns `502 Bad Gateway` for the same reason — `main.py:489` calls `library-profiles/brief-institutions` to translate the OCLC symbol into a registryId before it can hit `ILL_POLICIES_BASE/servicePolicy/{rid}` at `main.py:497`.

**Root cause:** the current WSKey is provisioned only with the `policiesDirectoryAPI` scope. The Library Profiles API lives in a different OCLC product family and the WSKey itself needs that entitlement — not just the requested token scope.

## New WSKey request — answers to use on the OCLC form

### App type
**Machine-to-Machine (M2M) App.** The FastAPI proxy in `main.py` is a non-interactive back-end service that holds the WSKey and gets tokens via `client_credentials`. The browser never sees the WSKey.

### Reason / application description (paste this)

> Lender Finder is an internal ILL workflow tool for our library. Staff upload OCLC WorldShare Borrower Transaction-Level Detail reports to rank past suppliers by fill rate, turnaround, and consistency, and to discover new candidate lenders from a peer directory. A small FastAPI proxy (server-to-server, M2M) holds the WSKey and enriches selected lenders with policy data — fees, hours, contact info, materials supplied, delivery methods — from the OCLC ILL Policies Directory. The proxy resolves OCLC symbols to registry IDs via the Library Profiles API and then fetches policies; results are cached for 24 hours to minimize API load. The browser never holds the WSKey; it only talks to our proxy.

### Services to tick

**Required:**
- Interlibrary Loan Policies Directory

**Add in the "reason / additional notes" field, since it's not in the service checklist:**

> Please also grant Library Profiles API access on this same WSKey for OCLC symbol → registryId resolution. The proxy needs both endpoints to translate symbols (e.g. `FUG`) into the registry IDs the Policies Directory requires.

**Recommended headroom (only if your account allows multiple):**
- ILL Fee Management API (IFM) — useful later if we want to read fee transactions

**Skip:**
- Article Exchange, Resource Request Sharing API, Availability Query, WorldCat Entity Data — not used by current code.

### Grant config
- Grant type: **Client Credentials (CCG)**
- Context institution ID: **8995**

## When the key arrives

1. Update `.env` (do not commit — `.env` is gitignored):

   ```
   OCLC_WSKEY=<new key>
   OCLC_SECRET=<new secret>
   OCLC_CONTEXT_INSTITUTION_ID=8995
   OCLC_SCOPES=policiesDirectoryAPI <whatever-scope-name-OCLC-issued-for-Library-Profiles>
   ```

   OCLC will name the second scope in the grant email — common labels are `WorldCatRegistry`, `library-profiles-discovery`, or `library-profile-search`. Use whatever they tell you.

2. Re-run the probe — expect a real institution body, not 403:

   ```bash
   cd /workspaces/oclc-lender-finder
   python scripts/probe_oclc.py FUG
   ```

3. Start the proxy and verify the real endpoint:

   ```bash
   uvicorn main:app --reload --port 8000
   curl http://localhost:8000/api/policies/FUG | jq
   ```

   Expect a JSON bundle with `symbol`, `registry_id`, fees, hours, contact, etc. — not `{"detail": "OCLC API error: HTTP 403"}`.

4. If individual fields come back `null`, that's expected — the `_map_*` functions in `main.py` (search for `VERIFY ON FIRST REAL CALL` in the docstring) need their field paths adjusted once we see what OCLC actually returns. Save the probe output and adjust those mappings.

## Fallback if OCLC won't grant Library Profiles

If OCLC declines to add Library Profiles to the WSKey, ask Claude to refactor `main.py` to use the ILL Policies Directory's own `/institutions?oclcSymbol=…` lookup (in the same API family as the policies endpoint, so it only needs the `policiesDirectoryAPI` scope we already have). That avoids the `discovery.api.oclc.org/library-profiles/brief-institutions` hop entirely.

## Files involved

- `main.py` — FastAPI proxy. `_oclc_get` at the top is the token+request helper; `_map_institution` / `_map_*` at the bottom do the field translation that needs tuning.
- `scripts/probe_oclc.py` — one-shot CLI probe for raw OCLC responses. Useful for inspecting field names before tuning the mappers.
- `requirements.txt` — pinned deps (FastAPI 0.115, uvicorn 0.30.6, httpx 0.27.2, pydantic 2.9.2, python-dotenv 1.0.1).
- `.env.example` — template; copy to `.env` and fill in. `OCLC_SCOPES` defaults to `policiesDirectoryAPI` and needs the Library Profiles scope appended.
- Front-end (`app.js` / `index.html`): the Discover tab's "OCLC policy lookup" section already accepts a backend URL and calls `GET /api/policies/{symbol}` — no changes needed once the proxy works.
