"""Convert OCLC_FILM-4_or_less_Cleaned(1).xlsx into film-policies.json.

Same shape as build_lvis_policies.py, but for the FILM group. The source
spreadsheet has two extra columns (Supplier, Notes) that we drop — Supplier
is constant ("Yes") for every row in this export, and Notes is empty.

Run: python3 scripts/build_film_policies.py
"""
from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import openpyxl

try:
    import pgeocode  # type: ignore
except ImportError:
    pgeocode = None

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "OCLC_FILM-4_or_less_Cleaned(1).xlsx"
DST = ROOT / "film-policies.json"

DAYS_RE = re.compile(r"^(\d+)\s*days?$", re.I)
LOC_RE = re.compile(r"^(?P<city>.+?),\s*(?P<state>[A-Z]{2})\s+(?P<country>[A-Z]{2,3})$")
LOC_FALLBACK_RE = re.compile(r"^(?P<city>.+?),\s*(?P<country>[A-Z]{2,3})$")


def parse_days(value):
    if value is None:
        return None
    m = DAYS_RE.match(str(value).strip())
    return int(m.group(1)) if m else None


def parse_location(value):
    if not value:
        return {"city": None, "state": None, "country": None, "raw": value}
    raw = str(value).strip()
    m = LOC_RE.match(raw)
    if m:
        return {"city": m["city"], "state": m["state"], "country": m["country"], "raw": raw}
    m = LOC_FALLBACK_RE.match(raw)
    if m:
        return {"city": m["city"], "state": None, "country": m["country"], "raw": raw}
    return {"city": None, "state": None, "country": None, "raw": raw}


POLICY_URL_FMT = "https://illpolicies.oclc.org/dill-ui/InstitutionResults.do?start={institution_id}"


def institution_id_from(url):
    if not url:
        return None
    try:
        qs = parse_qs(urlparse(url).query)
        vals = qs.get("start") or qs.get("institutionId") or qs.get("institutionID")
        return vals[0] if vals else None
    except Exception:
        return None


def policy_url_for(institution_id):
    return POLICY_URL_FMT.format(institution_id=institution_id) if institution_id else None


def clean_fee(value):
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def build_geocoder():
    if pgeocode is None:
        return None, None
    nomi = pgeocode.Nominatim("us")
    df = nomi._data
    from collections import defaultdict
    city_idx = defaultdict(list)
    state_idx = defaultdict(list)
    for place, state_code, lat, lng in zip(
        df["place_name"], df["state_code"], df["latitude"], df["longitude"]
    ):
        if state_code is None or lat != lat or lng != lng:
            continue
        state_idx[state_code].append((float(lat), float(lng)))
        if place:
            city_idx[(re.sub(r"\s+", " ", str(place).strip().lower()), state_code)].append(
                (float(lat), float(lng))
            )
    return city_idx, state_idx


def avg_coords(coords):
    if not coords:
        return (None, None)
    lat = sum(c[0] for c in coords) / len(coords)
    lng = sum(c[1] for c in coords) / len(coords)
    return (round(lat, 4), round(lng, 4))


def main():
    if not SRC.exists():
        print(f"missing source: {SRC}", file=sys.stderr)
        sys.exit(1)

    wb = openpyxl.load_workbook(SRC)
    ws = wb["Cleaned Libraries"]
    libraries: dict[str, dict] = {}
    skipped = 0
    duplicates: list[str] = []

    city_idx, state_idx = build_geocoder()
    geocoded_city = 0
    geocoded_state = 0

    for row in ws.iter_rows(min_row=2):
        # FILM layout: Institution, Library/Branch, Symbols, Supplier,
        # CopiesDays, LoansDays, CopiesFees, LoansFees, Location, Notes
        inst_cell, branch_cell, sym_cell, _supplier, cdays, ldays, cfees, lfees, loc_cell, _notes = row
        symbol = (sym_cell.value or "").strip()
        if not symbol:
            skipped += 1
            continue

        source_url = inst_cell.hyperlink.target if inst_cell.hyperlink else None
        institution_id = institution_id_from(source_url)
        policy_url = policy_url_for(institution_id)
        loc = parse_location(loc_cell.value)

        lat: float | None = None
        lng: float | None = None
        coords_from_state = False
        if city_idx is not None and loc.get("state"):
            city_key = (re.sub(r"\s+", " ", (loc["city"] or "").strip().lower()), loc["state"])
            coords = city_idx.get(city_key)
            if coords:
                lat, lng = avg_coords(coords)
                geocoded_city += 1
            elif state_idx is not None:
                coords = state_idx.get(loc["state"])
                if coords:
                    lat, lng = avg_coords(coords)
                    coords_from_state = True
                    geocoded_state += 1

        entry = {
            "symbol": symbol,
            "institution": (inst_cell.value or "").strip() or None,
            "branch": (branch_cell.value or "").strip() if branch_cell.value else None,
            "city": loc["city"],
            "state": loc["state"],
            "country": loc["country"],
            "location": loc["raw"],
            "copiesDaysToRespond": parse_days(cdays.value),
            "loansDaysToRespond": parse_days(ldays.value),
            "copiesFees": clean_fee(cfees.value),
            "loansFees": clean_fee(lfees.value),
            "policyUrl": policy_url,
            "institutionId": institution_id,
            "lat": lat,
            "lng": lng,
            "group": "FILM",
        }
        if coords_from_state:
            entry["_coordsFromState"] = True

        if symbol in libraries:
            duplicates.append(symbol)
            continue
        libraries[symbol] = entry

    out = {
        "_meta": {
            "description": (
                "FILM Group library data used by Lender Finder. Filtered to "
                "institutions with stated turnaround of 4 days or less. Each "
                "entry's `policyUrl` is that institution's OCLC ILL policies "
                "page — use it for 'View OCLC policies' / 'Load policies from "
                "OCLC' instead of running a symbol search."
            ),
            "source": SRC.name,
            "group": "FILM",
            "lastUpdated": date.today().isoformat(),
            "count": len(libraries),
            "fields": {
                "symbol": "OCLC institution symbol",
                "institution": "Institution name",
                "branch": "Library/branch name when distinct from institution",
                "city": "City parsed from location",
                "state": "Two-letter US state code (null for non-US)",
                "country": "Country code (e.g. US)",
                "location": "Raw location string from the export",
                "copiesDaysToRespond": "Stated turnaround for copy requests, in days",
                "loansDaysToRespond": "Stated turnaround for loan requests, in days",
                "copiesFees": "Fee string for copies (varies — may be a range or 'XXX' currency)",
                "loansFees": "Fee string for loans",
                "policyUrl": "Direct link to this institution in the OCLC ILL Policies Directory",
                "institutionId": "OCLC DILL institutionId parsed from policyUrl",
                "lat": "Approximate latitude (city centroid from US postal data)",
                "lng": "Approximate longitude (city centroid from US postal data)",
                "group": "Always 'FILM' for this dataset",
            },
        },
        "libraries": libraries,
    }

    DST.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {DST.relative_to(ROOT)}: {len(libraries)} entries, skipped {skipped}, duplicates {len(duplicates)}")
    if city_idx is None:
        print("  geocoding skipped — install pgeocode for city centroid lat/lng")
    else:
        print(f"  geocoded: {geocoded_city} city-matched, {geocoded_state} state-fallback")
    if duplicates:
        print("  duplicate symbols (first kept):", duplicates[:10])


if __name__ == "__main__":
    main()
