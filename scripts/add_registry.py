"""Add (or overwrite) a symbol -> registryId entry in symbol-registry.json.

The OCLC ILL Policies Directory website (https://policies.oclc.org/) is free
to browse without an API key. Search for an OCLC symbol there and the URL of
the resulting institution page contains its registryId. Copy that registryId
and pin it here so main.py can use it without Library Profiles API access.

Usage:
    python scripts/add_registry.py FUG 58
    python scripts/add_registry.py FUG 58 NTD 1234 CGU 7890   # bulk
    python scripts/add_registry.py --remove FUG               # delete an entry
    python scripts/add_registry.py --list                     # print current map

The file format is plain JSON: {"FUG": "58", ...} (an "_comment" key is
preserved). Re-runs are idempotent.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "symbol-registry.json"


def load() -> dict:
    if not PATH.exists():
        return {}
    try:
        return json.loads(PATH.read_text() or "{}")
    except json.JSONDecodeError as e:
        print(f"ERROR: {PATH} is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)


def save(data: dict) -> None:
    PATH.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


def list_entries(data: dict) -> None:
    real = {k: v for k, v in data.items() if not k.startswith("_")}
    if not real:
        print("(empty — no symbol -> registryId mappings yet)")
        return
    width = max(len(k) for k in real)
    for sym in sorted(real):
        print(f"{sym:<{width}}  {real[sym]}")


def main() -> None:
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return

    data = load()

    if argv[0] == "--list":
        list_entries(data)
        return

    if argv[0] == "--remove":
        removed = []
        for sym in argv[1:]:
            key = sym.upper()
            if key in data:
                data.pop(key)
                removed.append(key)
        save(data)
        print(f"Removed: {', '.join(removed) or '(none)'}")
        return

    if len(argv) % 2 != 0:
        print("ERROR: arguments must come in symbol/registryId pairs", file=sys.stderr)
        print(__doc__, file=sys.stderr)
        sys.exit(2)

    added = []
    for i in range(0, len(argv), 2):
        sym = argv[i].upper().strip()
        rid = argv[i + 1].strip()
        if not sym.isalnum():
            print(f"WARN: skipping {sym!r} — symbols must be alphanumeric", file=sys.stderr)
            continue
        if not rid:
            print(f"WARN: skipping {sym!r} — empty registryId", file=sys.stderr)
            continue
        data[sym] = rid
        added.append(f"{sym}={rid}")

    save(data)
    print(f"Wrote {PATH.name}: {', '.join(added) or '(no changes)'}")
    print()
    list_entries(data)


if __name__ == "__main__":
    main()
