# Lender Finder OCLC Proxy

Small FastAPI service that lets the static [Lender Finder](https://github.com/) Pages site reach the OCLC Library Profiles and ILL Policies Directory APIs without exposing WSKey credentials in the browser.

## What it does

Two endpoints. Both cache responses in memory for 24 hours by default (configurable).

```
GET /api/policies/search?q=florida
    Search the Library Profiles directory by name or symbol.
    Returns a list of InstitutionBrief objects.

GET /api/policies/FUG
    Full policy bundle for an OCLC symbol: institution metadata, fees,
    materials, delivery methods, contact, hours, loan terms.
```

The frontend treats every field as optional. Missing data renders as "—" instead of breaking the page.

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # then fill in OCLC_WSKEY and OCLC_SECRET
uvicorn app.main:app --reload --port 8000
```

Test:

```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/policies/FUG | jq .
```

## Verify the field mappings on first real run

The OCLC API docs in the project knowledge confirm endpoint paths and top-level schema names but don't show concrete field names inside the JSON responses for fees and policies. The `_map_*` functions in `app/main.py` contain best-guess field names with `VERIFY` comments.

After your first real API call:

1. Hit `/api/policies/FUG` (or any symbol you know is in OCLC).
2. Compare the response to what comes back from `curl` against the raw OCLC endpoints — uvicorn logs every outbound call, so you can replay them.
3. If a field comes back as `null` but should have data, look at the raw OCLC JSON and fix the field name in the matching `_map_*` function. Each function has TODO comments showing the alternative keys it tries.

The mapping layer is intentionally tolerant — it tries multiple candidate field names before giving up. So in most cases the mapping "just works" without changes.

## Deploy

Two free-tier options included; pick one.

### Render

Pre-configured in `render.yaml`. After connecting your GitHub repo:

1. Render reads `render.yaml` and creates the service automatically.
2. In the Render dashboard, set `OCLC_WSKEY`, `OCLC_SECRET`, and `ALLOWED_ORIGIN` (your Pages site URL, e.g. `https://your-user.github.io`).
3. Deploy. The service exposes `https://lender-finder-proxy.onrender.com`.

Free tier note: Render free services spin down after 15 minutes of inactivity and take ~30 seconds to wake up. For staff usage this is usually acceptable; the first search of the day will be slow.

### Fly.io

Pre-configured in `fly.toml`. After `fly auth login`:

```bash
fly launch --no-deploy           # accept the existing config
fly secrets set OCLC_WSKEY=... OCLC_SECRET=... ALLOWED_ORIGIN=https://your-user.github.io
fly deploy
```

Fly's free tier auto-stops/starts machines, similar latency profile to Render.

### Other options

The included Dockerfile works on any container host: AWS Fargate, Google Cloud Run, Azure Container Apps, your library's own Kubernetes. The only required configuration is the three environment variables.

## Configure the frontend

In the Lender Finder Pages site, set the backend URL in `app.js`:

```javascript
const BACKEND_URL = 'https://lender-finder-proxy.onrender.com';
```

Leave it as an empty string to disable policy lookup (the rest of the site keeps working).

## Security

- The WSKey never leaves the backend.
- CORS is locked down to `ALLOWED_ORIGIN` in production — only your Pages site can call the backend.
- No authentication is enforced on the proxy itself; if it's publicly reachable, anyone who knows the URL can query OCLC through it. For internal-only use, deploy behind your library's VPN or add a shared-token header check. The free tiers above are public by default.

## What's NOT in the proxy

- No database. Cache is in-memory and resets on restart.
- No write operations. The proxy only reads from OCLC.
- No user-facing analytics. The frontend handles ranking and faceted display.
- No webhook or sync features. OCLC data is fetched on demand.

This keeps the proxy small, stateless, and easy to redeploy. The Pages site is still the source of truth for which lenders staff are interested in.
