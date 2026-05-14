"""Heuristic library-type classifier shared by the LVIS/FILM build scripts.

Maps an institution name (and optional branch name) to one of the type
buckets the app uses:

  Academic, Archives, Consortium, Corporate, Government, Law, Medical,
  Museum, Music, Public, School, Special, Other

The classifier is name-based and ordered most-specific-first so that
overlapping markers (e.g. "school of medicine" should be Medical, not
Academic) resolve correctly. Names with no recognizable marker fall to
'Other' rather than being guessed at.
"""
from __future__ import annotations

import re

# K-12 schools — checked first so "school of medicine" etc. don't fall here.
SCHOOL_MARKERS = (
    "high school",
    "middle school",
    "elementary school",
    "school district",
    "preparatory school",
    "k-12",
    "k-8",
    "k-6",
)

# Music conservatories and schools of music.
MUSIC_MARKERS = (
    "conservatory",
    "school of music",
    "institute of music",
    "college of music",
    "music library",
)

# Law libraries: law schools, court libraries, law firms, legislative reference.
LAW_MARKERS = (
    "law school",
    "school of law",
    "college of law",
    "law library",
    "law firm",
    "law office",
    "court library",
    "court of appeals",
    "supreme court",
    "circuit court",
    "u.s. court",
    "us court",
    "law and legislative",
    "law & legis",
    "legislative reference",
    "legislative library",
    "legal library",
)

# Medical libraries: hospitals, medical schools, health sciences libraries.
MEDICAL_MARKERS = (
    "medical center",
    "medical school",
    "school of medicine",
    "school of nursing",
    "school of osteopathic",
    "school of dentistry",
    "school of veterinary",
    "school of pharmacy",
    "school of public health",
    "college of medicine",
    "college of nursing",
    "college of pharmacy",
    "college of veterinary",
    "medical library",
    "medical sciences",
    "health sciences library",
    "health professions library",
    "health science library",
    "national library of medicine",
    "biomedical",
    "hospital",
    "veterinary medicine",
)

# Museums and art galleries.
MUSEUM_MARKERS = (
    "museum",
    "art gallery",
    "gallery of art",
    "national gallery",
    "menil collection",
    "smithsonian",  # Smithsonian Institution Libraries serve the museums
)

# Archives institutions.
ARCHIVES_MARKERS = (
    "archives",
    "national archives",
)

# Federal/state/municipal government libraries (non-medical, non-law, non-archives).
GOVERNMENT_MARKERS = (
    "library of congress",
    "national library of",
    "national agricultural library",
    "national science foundation",
    "national institute of standards",
    "national institute of environmental health",
    "national institutes of health",
    "nih ",
    "niaid",
    "rocky mountain laboratories",
    "boulder labs",
    "u.s. department",
    "us department of",
    "united states department",
    "department of agriculture",
    "department of defense",
    "department of energy",
    "department of the interior",
    "department of state",
    "department of veterans",
    "department of transportation",
    "department of health",
    "department of conservation",
    "veterans affairs",
    "federal reserve",
    "federal bureau",
    "federal aviation",
    "naval war college",
    "naval academy",
    "naval postgraduate",
    "naval research",
    "naval undersea",
    "naval surface warfare",
    "naval air station",
    "patuxent river",
    "air war college",
    "air force academy",
    "air force base",
    " afb ",
    "afb library",
    "afrl",
    "air force research",
    "air force civil engineer",
    "air force institute of technology",
    "army war college",
    "us military academy",
    "u.s. military academy",
    "marine corps university",
    "nasa ",
    "noaa ",
    "centers for disease control",
    "environmental protection agency",
    "government printing office",
    "u.s. army",
    "u.s. navy",
    "u.s. air force",
    "u.s. marine",
    "us army",
    "us navy",
    "us air force",
    "u.s. coast guard",
    "us coast guard",
    "defense language institute",
    "defense technical information",
    "bureau of ocean energy",
    "bureau of land management",
    "bureau of reclamation",
    "bureau of indian affairs",
    "u.s. geological survey",
    "us geological survey",
    "geological survey library",
    "state library",
    "library of virginia",
    "library commission",
    "pollution control",
    "energy commission",
    "fish & wildlife",
    "fish and wildlife",
    "arnold engineering development",
    "bonneville power administration",
)

# Corporate research libraries / info centers.
CORPORATE_MARKERS = (
    "infocenter",
    "info center",
    "technical information center",
    "corporation library",
    " corp library",
    " inc. library",
    " inc library",
    "cdm smith",
)

# Library consortia, cooperatives, networks, multi-institutional services.
CONSORTIUM_MARKERS = (
    "library cooperative",
    "library consortium",
    "library network",
    "library system service",
    "service center",
    "research libraries",
    "marine consortium",
    "universities marine",
    "metropolitan library system",
)

# Higher-ed academic libraries.
ACADEMIC_MARKERS = (
    "university",
    " college",
    "college,",
    "college of",
    "college library",
    "community college",
    "junior college",
    "college (",
    "seminary",
    "school of theology",
    "school of design",
    "school of visual arts",
    "school of art",
    "art institute",
    "graduate school",
    "theological school",
    "institute of technology",
    "polytechnic",
    "academy of",
    "suny ",
    "suny at",
    "military institute",
    "the citadel",
    "notre dame library",
    "loyola notre dame",
    "erikson institute",
    "nashotah house",
    "rhode island school",
    "montana tech",
    "bible institute",
    "institute of mining",
    "institute of the arts",
    "institute of integral",
    "institute of the americas",
    "cal poly",
    "virginia tech",
    "cuny",
    "unh durham",
    "moody bible",
    "graduate center library",
)

# Public libraries.
PUBLIC_MARKERS = (
    "public library",
    "public libraries",
    "library district",
    "district library",
    "library system",  # most "library system" hits are municipal/county
    "free library",
    "memorial library",
    "regional library",
    "county library",
    "township library",
    "parish library",
    "town library",
    "village library",
    "borough library",
    "community library",
    "branch library",
    "library association",
    "carnegie library",
    "consolidated library",
    "city libraries",
    "city library",
    "athenaeum",
    "sno-isle libraries",
    " libraries",
)

# Catch-all "special" — historical societies, foundations, religious, think tanks.
SPECIAL_MARKERS = (
    "historical society",
    "historical association",
    "research institute",
    "research center",
    "research library",
    "monastery",
    "abbey",
    "diocese",
    "archdiocese",
    "synod",
    "presbytery",
    "society of",
    "society library",
    "institute for",
    "center for",
    "foundation library",
    "foundation,",
    "genealogical",
    "botanical",
    "botanic garden",
    "zoological",
    "observatory",
    "cultural center",
    "heritage center",
    "arboretum",
    "brookings institution",
    "carnegie endowment",
    "wildlife conservation",
    "population council",
    "endowment for",
)


def _hit(haystack: str, markers) -> bool:
    return any(m in haystack for m in markers)


def classify_type(name: str | None, branch: str | None = None) -> str:
    """Return the best-guess library type for a given institution/branch name."""
    if not name:
        return "Other"
    combined = re.sub(r"\s+", " ", f"{name} {branch or ''}".lower()).strip()

    if _hit(combined, SCHOOL_MARKERS):
        return "School"
    if _hit(combined, MUSIC_MARKERS):
        return "Music"
    if _hit(combined, LAW_MARKERS):
        return "Law"
    if _hit(combined, MEDICAL_MARKERS):
        return "Medical"
    if _hit(combined, MUSEUM_MARKERS):
        return "Museum"
    if _hit(combined, ARCHIVES_MARKERS):
        return "Archives"
    if _hit(combined, GOVERNMENT_MARKERS):
        return "Government"
    if _hit(combined, CORPORATE_MARKERS):
        return "Corporate"
    if _hit(combined, CONSORTIUM_MARKERS):
        return "Consortium"
    if _hit(combined, ACADEMIC_MARKERS):
        return "Academic"
    if _hit(combined, PUBLIC_MARKERS):
        return "Public"
    if _hit(combined, SPECIAL_MARKERS):
        return "Special"
    return "Other"
