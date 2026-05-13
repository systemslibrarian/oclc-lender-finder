"""One-shot probe: gets a CCG token, hits the Policies Directory for a
single OCLC symbol, and dumps every raw response to stdout so we can see
the real field names and adjust the mapping layer in main.py.

Usage:
    python scripts/probe_oclc.py FUG          # default symbol
    OCLC_PROBE_SYMBOL=NTD python scripts/probe_oclc.py
"""
from __future__ import annotations

import json
import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

WSKEY = os.environ["OCLC_WSKEY"]
SECRET = os.environ["OCLC_SECRET"]
CONTEXT = os.environ["OCLC_CONTEXT_INSTITUTION_ID"]
SCOPES = os.environ.get("OCLC_SCOPES", "policiesDirectoryAPI")

LIBRARY_PROFILES_BASE = "https://discovery.api.oclc.org/library-profiles"
ILL_POLICIES_BASE = "https://ill.sd00.worldcat.org/illpolicies"


def main() -> None:
    symbol = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("OCLC_PROBE_SYMBOL", "FUG")).upper()

    with httpx.Client(timeout=30) as c:
        print(f"==> requesting token (scopes={SCOPES!r}, context={CONTEXT})")
        tr = c.post(
            "https://oauth.oclc.org/token",
            data={
                "grant_type": "client_credentials",
                "scope": SCOPES,
                "context_institution_id": CONTEXT,
            },
            auth=(WSKEY, SECRET),
            headers={"Accept": "application/json"},
        )
        print("token status:", tr.status_code)
        print(tr.text[:500])
        tr.raise_for_status()
        token = tr.json()["access_token"]

        def get(label: str, url: str, params: dict | None = None) -> dict | None:
            print(f"\n==> {label}: GET {url} params={params}")
            r = c.get(url, params=params or {}, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
            print("status:", r.status_code, "ct:", r.headers.get("content-type"))
            body = r.text
            print(body[:1500])
            try:
                return r.json() if r.headers.get("content-type", "").startswith("application/json") else None
            except Exception:
                return None

        profile = get("brief-institutions", f"{LIBRARY_PROFILES_BASE}/brief-institutions",
                      {"oclcSymbol": symbol, "limit": 1})
        rid = None
        if isinstance(profile, dict):
            for key in ("briefInstitutions", "institutions", "entries"):
                arr = profile.get(key)
                if isinstance(arr, list) and arr:
                    rid = arr[0].get("registryId") or arr[0].get("RegistryId")
                    break

        # Fallbacks: a WSKey scoped only to policiesDirectoryAPI may 403 on
        # the Library Profiles call above. Try institution lookups exposed by
        # the Policies Directory itself.
        if not rid:
            print("\n==> brief-institutions failed; trying Policies Directory institution lookups")
            for label, url, params in (
                ("ipd-institution-by-symbol",
                 f"{ILL_POLICIES_BASE}/institution",
                 {"oclcSymbol": symbol}),
                ("ipd-institution-symbol-path",
                 f"{ILL_POLICIES_BASE}/institution/{symbol}",
                 None),
                ("ipd-search-institutions",
                 f"{ILL_POLICIES_BASE}/searchInstitutions",
                 {"oclcSymbol": symbol}),
                ("americas-discovery-ipd",
                 "https://americas.discovery.api.oclc.org/ill-policies/v1/institutions",
                 {"oclcSymbol": symbol}),
            ):
                body = get(label, url, params)
                if isinstance(body, dict):
                    for key in ("entries", "institutions", "briefInstitutions"):
                        arr = body.get(key)
                        if isinstance(arr, list) and arr:
                            rid = (arr[0].get("registryId") or arr[0].get("RegistryId")
                                   or arr[0].get("institutionId") or arr[0].get("id"))
                            if rid:
                                break
                    if not rid:
                        rid = (body.get("registryId") or body.get("RegistryId")
                               or body.get("institutionId") or body.get("id"))
                if rid:
                    print(f"\n==> resolved via {label}: registryId={rid!r}")
                    break

        print(f"\n==> registryId resolved: {rid!r}")
        if not rid:
            print("Cannot resolve registryId; stopping.")
            return

        base = f"{ILL_POLICIES_BASE}/servicePolicy/{rid}"
        for sub in (
            "servicePolicyAggregateFees",
            "servicePolicyPolicy",
            "servicePolicyContact",
            "servicePolicyHours",
            "servicePolicyClosure",
            "servicePolicyInstitution/supplier",
        ):
            get(sub, f"{base}/{sub}")


if __name__ == "__main__":
    main()
