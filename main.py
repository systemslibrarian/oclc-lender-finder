"""FastAPI proxy for the OCLC Library Profiles + ILL Policies Directory APIs.

Architecture
------------
The browser cannot hold a WSKey without leaking it. This service holds the
WSKey, fetches an OAuth bearer token, calls OCLC on behalf of the browser,
and returns a normalized JSON shape the frontend can render. Two endpoints:

    GET /api/policies/{symbol}        Full policy bundle for one library
    GET /api/policies/search?q=...    Search the directory by name/symbol

Lookups go through the Library Profiles API first to translate an OCLC
symbol into a registry ID, then through the ILL Policies Directory for
fees, hours, contact, and per-format policy.

Response shapes
---------------
The frontend treats every field as optional. Any field the API doesn't
return or the mapping layer doesn't understand falls through as `null` and
the UI renders "—". This keeps the system from breaking when OCLC adjusts
field names — only the mapping layer needs updating.

VERIFY ON FIRST REAL CALL
-------------------------
The OpenAPI documentation in the project bundle confirms endpoint paths
and schema names but does not show concrete field names inside the
response JSON for fees and policies. The `_map_*` functions below contain
my best-guess field names with TODOs. After the first real API response,
adjust the field paths in those functions and the rest of the system
works unchanged.

Running locally
---------------
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env       # fill in OCLC_WSKEY / OCLC_SECRET
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

OCLC_WSKEY = os.environ.get("OCLC_WSKEY", "")
OCLC_SECRET = os.environ.get("OCLC_SECRET", "")
# OCLC institution registry/symbol context for CCG. Required by OCLC's
# client-credentials flow; for Leon County Public Library System this is 8995.
OCLC_CONTEXT_INSTITUTION_ID = os.environ.get("OCLC_CONTEXT_INSTITUTION_ID", "")
# Scopes granted on the WSKey. Space-separated. Default covers what the
# Lender Finder needs (ILL Policies Directory). Add IFM/articleExchange
# only if you actually call those endpoints.
OCLC_SCOPES = os.environ.get("OCLC_SCOPES", "policiesDirectoryAPI")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "86400"))
# Local file with hand-curated or pre-resolved OCLCSymbol -> registryId pairs.
# Used so the proxy can work with only the policiesDirectoryAPI scope.
SYMBOL_REGISTRY_PATH = os.environ.get("SYMBOL_REGISTRY_PATH", "symbol-registry.json")
LENDERS_DIRECTORY_PATH = os.environ.get("LENDERS_DIRECTORY_PATH", "lenders-directory.json")
# Set to false to skip the Library Profiles fallback even if the scope is granted.
USE_LIBRARY_PROFILES = os.environ.get("USE_LIBRARY_PROFILES", "auto").lower()

TOKEN_URL = "https://oauth.oclc.org/token"
LIBRARY_PROFILES_BASE = "https://discovery.api.oclc.org/library-profiles"
ILL_POLICIES_BASE = "https://ill.sd00.worldcat.org/illpolicies"

app = FastAPI(title="Lender Finder OCLC Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN] if ALLOWED_ORIGIN != "*" else ["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

_token_cache: dict[str, Any] = {"token": None, "expires": 0.0}
_response_cache: dict[str, tuple[float, Any]] = {}


def _cached_get(key: str) -> Any | None:
    item = _response_cache.get(key)
    if not item:
        return None
    expires, value = item
    if time.time() > expires:
        del _response_cache[key]
        return None
    return value


def _cache_set(key: str, value: Any) -> None:
    _response_cache[key] = (time.time() + CACHE_TTL_SECONDS, value)


async def _get_token(client: httpx.AsyncClient) -> str:
    if _token_cache["token"] and time.time() < _token_cache["expires"] - 60:
        return _token_cache["token"]
    if not OCLC_WSKEY or not OCLC_SECRET:
        raise HTTPException(500, "OCLC_WSKEY and OCLC_SECRET must be set in the environment")
    if not OCLC_CONTEXT_INSTITUTION_ID:
        raise HTTPException(500, "OCLC_CONTEXT_INSTITUTION_ID must be set (your library's OCLC institution ID)")
    data = {
        "grant_type": "client_credentials",
        "scope": OCLC_SCOPES,
        "context_institution_id": OCLC_CONTEXT_INSTITUTION_ID,
    }
    r = await client.post(
        TOKEN_URL,
        data=data,
        auth=(OCLC_WSKEY, OCLC_SECRET),
        headers={"Accept": "application/json"},
    )
    if r.status_code != 200:
        log.error("Token request failed: %s %s", r.status_code, r.text[:300])
        raise HTTPException(502, f"OCLC OAuth token request failed: HTTP {r.status_code}")
    body = r.json()
    _token_cache["token"] = body["access_token"]
    _token_cache["expires"] = time.time() + int(body.get("expires_in", 3600))
    return _token_cache["token"]


async def _oclc_get(path: str, params: dict | None = None) -> Any:
    """Cached GET against an OCLC endpoint. Returns the JSON body."""
    cache_key = f"{path}?{sorted((params or {}).items())}"
    cached = _cached_get(cache_key)
    if cached is not None:
        return cached
    async with httpx.AsyncClient(timeout=30) as client:
        token = await _get_token(client)
        r = await client.get(
            path,
            params=params or {},
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        if r.status_code == 404:
            return None
        if r.status_code >= 400:
            log.error("OCLC GET %s failed: %s %s", path, r.status_code, r.text[:300])
            raise HTTPException(502, f"OCLC API error: HTTP {r.status_code}")
        data = r.json()
        _cache_set(cache_key, data)
        return data


async def _oclc_try_get(path: str, params: dict | None = None) -> Any:
    """Like _oclc_get but returns None on any 4xx (used for probing fallback endpoints)."""
    cache_key = f"try:{path}?{sorted((params or {}).items())}"
    cached = _cached_get(cache_key)
    if cached is not None:
        return None if cached == "__none__" else cached
    async with httpx.AsyncClient(timeout=30) as client:
        token = await _get_token(client)
        r = await client.get(
            path,
            params=params or {},
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        if r.status_code >= 400:
            log.info("Probe %s %s -> HTTP %d", path, params or {}, r.status_code)
            _cache_set(cache_key, "__none__")
            return None
        try:
            data = r.json()
        except Exception:
            return None
        _cache_set(cache_key, data)
        return data


# ---------- Local overrides: symbol -> registryId, and bundled directory ----------

_symbol_overrides: dict[str, Any] = {"mtime": 0.0, "map": {}}
_bundled_directory: dict[str, dict] = {}


def _load_symbol_overrides() -> dict[str, str]:
    """Load (and hot-reload) SYMBOL_REGISTRY_PATH. Returns OCLCSymbol -> registryId."""
    try:
        st = os.stat(SYMBOL_REGISTRY_PATH)
    except FileNotFoundError:
        return _symbol_overrides["map"]
    if st.st_mtime <= _symbol_overrides["mtime"]:
        return _symbol_overrides["map"]
    try:
        import json as _json
        with open(SYMBOL_REGISTRY_PATH) as f:
            data = _json.load(f)
        if not isinstance(data, dict):
            return _symbol_overrides["map"]
        norm: dict[str, str] = {}
        for k, v in data.items():
            if not k:
                continue
            sym = str(k).upper()
            if isinstance(v, dict):
                rid = v.get("registryId") or v.get("registry_id") or v.get("id")
            else:
                rid = v
            if rid:
                norm[sym] = str(rid)
        _symbol_overrides["map"] = norm
        _symbol_overrides["mtime"] = st.st_mtime
        log.info("Loaded %d symbol→registryId overrides from %s", len(norm), SYMBOL_REGISTRY_PATH)
        return norm
    except Exception as e:
        log.warning("Failed to load %s: %s", SYMBOL_REGISTRY_PATH, e)
        return _symbol_overrides["map"]


def _load_bundled_directory() -> dict[str, dict]:
    """Index lenders-directory.json by symbol so we can backfill name/state/type."""
    if _bundled_directory:
        return _bundled_directory
    try:
        import json as _json
        with open(LENDERS_DIRECTORY_PATH) as f:
            data = _json.load(f)
        lenders = data.get("lenders", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        for l in lenders:
            sym = (l.get("symbol") or "").upper()
            if sym:
                _bundled_directory[sym] = l
        log.info("Loaded %d bundled directory entries from %s", len(_bundled_directory), LENDERS_DIRECTORY_PATH)
    except FileNotFoundError:
        log.info("Bundled directory %s not found; skipping local enrichment", LENDERS_DIRECTORY_PATH)
    except Exception as e:
        log.warning("Failed to read %s: %s", LENDERS_DIRECTORY_PATH, e)
    return _bundled_directory


def _extract_registry_id(body: Any) -> str | None:
    """Walk an OCLC JSON body looking for the first registryId-shaped field."""
    if body is None:
        return None
    if isinstance(body, dict):
        for key in ("registryId", "RegistryId", "registry_id"):
            v = body.get(key)
            if v not in (None, ""):
                return str(v)
        for container in ("entries", "institutions", "briefInstitutions", "institution", "data", "results"):
            v = body.get(container)
            if v is not None:
                rid = _extract_registry_id(v)
                if rid:
                    return rid
    elif isinstance(body, list):
        for item in body:
            rid = _extract_registry_id(item)
            if rid:
                return rid
    return None


def _scope_has_library_profiles() -> bool:
    if USE_LIBRARY_PROFILES == "true":
        return True
    if USE_LIBRARY_PROFILES == "false":
        return False
    s = OCLC_SCOPES.lower()
    return ("library-profile" in s) or ("worldcatregistry" in s) or ("library_profiles" in s)


async def _resolve_registry_id(sym: str) -> tuple[str | None, str]:
    """Return (registryId or None, source label) for an OCLC symbol.

    Tries, in order:
      1. Local SYMBOL_REGISTRY_PATH overrides — zero API calls.
      2. ILL Policies Directory's own institution lookups (just policiesDirectoryAPI scope).
      3. Library Profiles brief-institutions — only if the scope is granted.
    """
    sym = sym.upper().strip()
    overrides = _load_symbol_overrides()
    if sym in overrides:
        return overrides[sym], "override"

    # Policies Directory candidates. Different OCLC tenants have different
    # paths exposed for symbol→registryId lookups, so we try a handful.
    pd_candidates: list[tuple[str, dict]] = [
        (f"{ILL_POLICIES_BASE}/institutions", {"oclcSymbol": sym}),
        (f"{ILL_POLICIES_BASE}/institutions", {"oclcSymbol": sym, "limit": 1}),
        (f"{ILL_POLICIES_BASE}/institution", {"oclcSymbol": sym}),
        (f"{ILL_POLICIES_BASE}/serviceInstitution", {"oclcSymbol": sym}),
        (f"{ILL_POLICIES_BASE}/servicePolicyInstitution", {"oclcSymbol": sym}),
    ]
    for path, params in pd_candidates:
        body = await _oclc_try_get(path, params)
        rid = _extract_registry_id(body)
        if rid:
            return rid, f"policies-directory:{path.rsplit('/', 1)[-1]}"

    if _scope_has_library_profiles():
        body = await _oclc_try_get(f"{LIBRARY_PROFILES_BASE}/brief-institutions", {"oclcSymbol": sym, "limit": 1})
        rid = _extract_registry_id(body)
        if rid:
            return rid, "library-profiles"

    return None, "not-found"


def _institution_from_local(sym: str, rid: str | None) -> InstitutionBrief:
    """Build an InstitutionBrief from bundled directory data when available."""
    entry = _load_bundled_directory().get(sym.upper())
    if not entry:
        return InstitutionBrief(symbol=sym.upper(), registry_id=rid)
    return InstitutionBrief(
        symbol=sym.upper(),
        registry_id=rid,
        name=entry.get("name"),
        state=entry.get("state"),
        country=entry.get("country") or "US",
        type=entry.get("type"),
        lat=_to_float(entry.get("lat")),
        lng=_to_float(entry.get("lng")),
    )


def _safe_get(obj: Any, *path: str, default: Any = None) -> Any:
    """obj['a']['b']['c'] but every step survives missing keys / non-dicts."""
    cur = obj
    for p in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(p)
        if cur is None:
            return default
    return cur


class InstitutionBrief(BaseModel):
    symbol: str | None = None
    registry_id: str | None = None
    name: str | None = None
    state: str | None = None
    country: str | None = None
    type: str | None = None
    lat: float | None = None
    lng: float | None = None


class FeeInfo(BaseModel):
    loan_min: float | None = None
    loan_max: float | None = None
    copy_min: float | None = None
    copy_max: float | None = None
    accepts_ifm: bool | None = None


class MaterialPolicy(BaseModel):
    material: str
    will_lend: bool | None = None
    notes: str | None = None


class DeliveryInfo(BaseModel):
    article_exchange: bool | None = None
    mail: bool | None = None
    fax: bool | None = None
    other: list[str] = []


class ContactInfo(BaseModel):
    email: str | None = None
    phone: str | None = None
    url: str | None = None


class HoursInfo(BaseModel):
    weekly_hours: str | None = None
    closures: list[str] = []


class LoanTerms(BaseModel):
    loan_period_days: int | None = None
    renewable: bool | None = None
    notes: str | None = None


class LenderPolicies(BaseModel):
    institution: InstitutionBrief
    is_supplier: bool | None = None
    fees: FeeInfo
    materials: list[MaterialPolicy]
    delivery: DeliveryInfo
    contact: ContactInfo
    hours: HoursInfo
    loan_terms: LoanTerms
    raw_warning: str | None = None


def _map_institution(profile_body: Any, symbol: str) -> InstitutionBrief:
    """Library Profiles brief-institutions response -> InstitutionBrief.

    The response is paginated; we read the first match.
    VERIFY: confirm `briefInstitutions` array key and inner field names
    against an actual call. The OpenAPI doc lists fields RegistryId,
    OCLCSymbol, State, PostalCode, Country, Latitude, Longitude.
    """
    inst = None
    if isinstance(profile_body, dict):
        for key in ("briefInstitutions", "institutions", "entries"):
            arr = profile_body.get(key)
            if isinstance(arr, list) and arr:
                inst = arr[0]
                break
        if inst is None and "registryId" in profile_body:
            inst = profile_body
    if not isinstance(inst, dict):
        return InstitutionBrief(symbol=symbol)
    return InstitutionBrief(
        symbol=inst.get("oclcSymbol") or inst.get("OCLCSymbol") or symbol,
        registry_id=str(inst.get("registryId") or inst.get("RegistryId") or "") or None,
        name=inst.get("institutionName") or inst.get("name"),
        state=inst.get("state") or inst.get("State"),
        country=inst.get("country") or inst.get("Country"),
        type=inst.get("institutionType") or inst.get("type"),
        lat=_to_float(inst.get("latitude") or inst.get("Latitude")),
        lng=_to_float(inst.get("longitude") or inst.get("Longitude")),
    )


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _map_fees(fees_body: Any) -> FeeInfo:
    """servicePolicyAggregateFees response -> FeeInfo.

    VERIFY: confirm feeRange structure. The OpenAPI mentions
    `servicePolicyAggregateFees`, `feeRange`, `serviceFee`. The exact
    field names below are best-guess.
    """
    if not isinstance(fees_body, dict):
        return FeeInfo()
    entries = fees_body.get("entries") or fees_body.get("aggregateFees") or []
    if isinstance(entries, dict):
        entries = [entries]

    def first_not_none(*vals):
        for v in vals:
            if v is not None:
                return v
        return None

    loan_min = loan_max = copy_min = copy_max = None
    accepts_ifm = None
    for e in entries:
        if not isinstance(e, dict):
            continue
        kind = (e.get("serviceType") or e.get("type") or "").lower()
        rng = e.get("feeRange") if isinstance(e.get("feeRange"), dict) else e
        lo = _to_float(first_not_none(rng.get("minimumFee"), rng.get("min"), e.get("minFee")))
        hi = _to_float(first_not_none(rng.get("maximumFee"), rng.get("max"), e.get("maxFee")))
        if "loan" in kind:
            loan_min, loan_max = lo, hi
        elif "copy" in kind or "article" in kind or "photocop" in kind:
            copy_min, copy_max = lo, hi
        if accepts_ifm is None:
            ifm = first_not_none(e.get("acceptsIFM"), e.get("ifm"))
            if ifm is not None:
                accepts_ifm = bool(ifm)
    return FeeInfo(loan_min=loan_min, loan_max=loan_max, copy_min=copy_min, copy_max=copy_max, accepts_ifm=accepts_ifm)


def _map_policies(policy_body: Any) -> tuple[list[MaterialPolicy], DeliveryInfo, LoanTerms]:
    """servicePolicyPolicy response -> per-material + delivery + loan terms.

    VERIFY: schema mentions itemCollection, itemMedia, copyPolicy, loanPolicy,
    chargePolicy, deliveryPolicy. Mapping here is intentionally tolerant.
    """
    materials: list[MaterialPolicy] = []
    delivery = DeliveryInfo()
    loan_terms = LoanTerms()
    if not isinstance(policy_body, dict):
        return materials, delivery, loan_terms

    entries = policy_body.get("entries") or policy_body.get("servicePolicies") or []
    if isinstance(entries, dict):
        entries = [entries]

    seen_materials: dict[str, MaterialPolicy] = {}
    for e in entries:
        if not isinstance(e, dict):
            continue
        material = _safe_get(e, "itemCollection", "name") or _safe_get(e, "itemMedia", "name") or e.get("material")
        if material:
            loan_p = e.get("loanPolicy")
            copy_p = e.get("copyPolicy")
            will = None
            notes = []
            if isinstance(loan_p, dict):
                lp = loan_p["policy"] if "policy" in loan_p else loan_p.get("supply")
                if lp is not None:
                    will = bool(lp) if isinstance(lp, bool) else ("yes" in str(lp).lower() or "will" in str(lp).lower())
                if loan_p.get("notes"):
                    notes.append(loan_p["notes"])
            if isinstance(copy_p, dict) and will is None:
                cp = copy_p["policy"] if "policy" in copy_p else copy_p.get("supply")
                if cp is not None:
                    will = bool(cp) if isinstance(cp, bool) else "yes" in str(cp).lower()
            seen_materials[material] = MaterialPolicy(
                material=material, will_lend=will, notes="; ".join(notes) or None
            )

        d = e.get("deliveryPolicy")
        if isinstance(d, dict):
            methods = d.get("deliveryMethods") or d.get("methods") or []
            if isinstance(methods, list):
                method_strs = [str(m).lower() for m in methods]
                if any("article exchange" in m for m in method_strs):
                    delivery.article_exchange = True
                if any("mail" in m or "post" in m for m in method_strs):
                    delivery.mail = True
                if any("fax" in m for m in method_strs):
                    delivery.fax = True
                other = [m for m in methods if isinstance(m, str)
                         and not any(k in m.lower() for k in ("article exchange", "mail", "post", "fax"))]
                delivery.other.extend(other)

        lp = e.get("loanPolicy")
        if isinstance(lp, dict):
            period = lp.get("loanPeriodDays") or lp.get("loanPeriod")
            if period and loan_terms.loan_period_days is None:
                try:
                    loan_terms.loan_period_days = int(period)
                except (TypeError, ValueError):
                    pass
            rn = lp.get("renewable") or lp.get("renewals")
            if rn is not None and loan_terms.renewable is None:
                loan_terms.renewable = bool(rn) if isinstance(rn, bool) else "yes" in str(rn).lower()

    materials = list(seen_materials.values())
    return materials, delivery, loan_terms


def _map_contact(contact_body: Any) -> ContactInfo:
    """servicePolicyContact -> ContactInfo. Picks the first ILL contact."""
    if not isinstance(contact_body, dict):
        return ContactInfo()
    entries = contact_body.get("entries") or contact_body.get("contacts") or []
    if isinstance(entries, dict):
        entries = [entries]
    ill_first, fallback = None, None
    for e in entries:
        if not isinstance(e, dict):
            continue
        role = (e.get("contactType") or e.get("role") or "").lower()
        if "ill" in role or "resource sharing" in role or "interlibrary" in role:
            ill_first = e
            break
        if fallback is None:
            fallback = e
    pick = ill_first or fallback or {}
    return ContactInfo(
        email=pick.get("email") or pick.get("emailAddress"),
        phone=pick.get("phone") or pick.get("phoneNumber"),
        url=pick.get("url") or pick.get("website"),
    )


def _map_hours(hours_body: Any, closure_body: Any) -> HoursInfo:
    weekly = None
    if isinstance(hours_body, dict):
        entries = hours_body.get("entries") or hours_body.get("hours") or []
        if isinstance(entries, dict):
            entries = [entries]
        bits: list[str] = []
        for e in entries:
            if not isinstance(e, dict):
                continue
            day = e.get("dayOfWeek") or e.get("day")
            opens = e.get("openTime") or e.get("opens")
            closes = e.get("closeTime") or e.get("closes")
            if day and opens and closes:
                bits.append(f"{day}: {opens}–{closes}")
        if bits:
            weekly = " · ".join(bits)

    closures: list[str] = []
    if isinstance(closure_body, dict):
        entries = closure_body.get("entries") or closure_body.get("closures") or []
        if isinstance(entries, dict):
            entries = [entries]
        for e in entries:
            if isinstance(e, dict):
                label = e.get("description") or e.get("name") or e.get("date")
                if label:
                    closures.append(str(label))
    return HoursInfo(weekly_hours=weekly, closures=closures)


def _map_supplier(supplier_body: Any) -> bool | None:
    """servicePolicyInstitution/supplier -> bool. None if unknown."""
    if not isinstance(supplier_body, dict):
        return None
    val = supplier_body.get("supplierStatus") or supplier_body.get("isSupplier")
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return "yes" in val.lower() or "active" in val.lower()
    return None


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "has_credentials": bool(OCLC_WSKEY and OCLC_SECRET),
        "cache_size": len(_response_cache),
    }


@app.get("/api/policies/search")
async def search_institutions(
    q: str = Query(..., min_length=2, description="Symbol, name, or partial name"),
    limit: int = Query(20, ge=1, le=50),
) -> list[InstitutionBrief]:
    """Search by symbol or name.

    When the Library Profiles scope is granted, hits that API for live search.
    Otherwise (the typical, free path) searches the bundled directory locally —
    which is what the frontend's Discover tab already uses.
    """
    looks_like_symbol = q.isalnum() and len(q) <= 8

    if _scope_has_library_profiles():
        params: dict[str, Any] = {"limit": limit}
        if looks_like_symbol:
            params["oclcSymbol"] = q.upper()
        else:
            params["name"] = q
        body = await _oclc_try_get(f"{LIBRARY_PROFILES_BASE}/brief-institutions", params)
        if body:
            arr = (
                body.get("briefInstitutions")
                or body.get("institutions")
                or body.get("entries")
                or []
            )
            out: list[InstitutionBrief] = []
            for inst in arr[:limit]:
                if not isinstance(inst, dict):
                    continue
                out.append(_map_institution({"briefInstitutions": [inst]}, inst.get("oclcSymbol", "")))
            if out:
                return out

    # Local fallback: scan the bundled directory.
    directory = _load_bundled_directory()
    needle = q.lower()
    overrides = _load_symbol_overrides()
    matches: list[InstitutionBrief] = []
    for sym, entry in directory.items():
        hay = f"{sym} {entry.get('name', '')}".lower()
        if needle in hay:
            matches.append(_institution_from_local(sym, overrides.get(sym)))
        if len(matches) >= limit:
            break
    return matches


@app.get("/api/policies/{symbol}", response_model=LenderPolicies)
async def get_policies(symbol: str) -> LenderPolicies:
    """Fetch full policy bundle for one OCLC symbol."""
    sym = symbol.upper().strip()
    rid, source = await _resolve_registry_id(sym)
    if not rid:
        raise HTTPException(
            404,
            (
                f"Could not resolve registryId for {sym}. "
                f"Add it to {SYMBOL_REGISTRY_PATH} as {{\"{sym}\": \"<registryId>\"}} "
                f"(look up the registryId at https://policies.oclc.org by searching {sym})."
            ),
        )
    log.info("Resolved %s -> registryId %s via %s", sym, rid, source)
    inst = _institution_from_local(sym, rid)
    base = f"{ILL_POLICIES_BASE}/servicePolicy/{rid}"

    fees_body = await _oclc_get(f"{base}/servicePolicyAggregateFees")
    policy_body = await _oclc_get(f"{base}/servicePolicyPolicy")
    contact_body = await _oclc_get(f"{base}/servicePolicyContact")
    hours_body = await _oclc_get(f"{base}/servicePolicyHours")
    closure_body = await _oclc_get(f"{base}/servicePolicyClosure")
    supplier_body = await _oclc_get(f"{base}/servicePolicyInstitution/supplier")

    fees = _map_fees(fees_body)
    materials, delivery, loan_terms = _map_policies(policy_body)
    contact = _map_contact(contact_body)
    hours = _map_hours(hours_body, closure_body)
    supplier = _map_supplier(supplier_body)

    warning = None
    has_data = any([
        fees_body, policy_body, contact_body, hours_body, closure_body, supplier_body
    ])
    if not has_data:
        warning = (
            "No policy data returned by OCLC for this registry ID. The institution "
            "may not publish ILL policies, or the registry ID could be stale."
        )

    return LenderPolicies(
        institution=inst,
        is_supplier=supplier,
        fees=fees,
        materials=materials,
        delivery=delivery,
        contact=contact,
        hours=hours,
        loan_terms=loan_terms,
        raw_warning=warning,
    )
