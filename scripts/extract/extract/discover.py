"""discover CLI: inventory client resources and loaders."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from extract.paths import ClientNotFound, resolve_client_root
from extract.resindex import parse_resindex
from extract.types import ClientRoot


def build_discovery_report(client: ClientRoot, probe: Optional[str] = None) -> Dict[str, Any]:
    index_path = client.stillness_dir / "resfileindex.txt"
    index = parse_resindex(index_path)

    candidates = {logical: client.resfiles_dir / index[logical].hash_path for logical in index}
    candidate_status = {
        logical: f"{path} [{'found' if path.exists() else 'missing'}]"
        for logical, path in candidates.items()
    }

    loaders: Dict[str, str] = {}
    if client.bin_dir is not None and client.bin_dir.is_dir():
        for entry in sorted(client.bin_dir.iterdir()):
            if entry.suffix.lower() in {".pyd", ".so", ".dylib"}:
                loaders[entry.name] = "found"

    report: Dict[str, Any] = {
        "clientRoot": {
            "build": client.build,
            "server": client.server,
            "root": str(client.root),
            "stillnessDir": str(client.stillness_dir),
            "resfilesDir": str(client.resfiles_dir),
            "binDir": str(client.bin_dir) if client.bin_dir else None,
        },
        "platform": client.platform,
        "indexEntries": len(index),
        "candidates": candidate_status,
        "loaders": loaders,
    }

    if probe is not None:
        if probe in index:
            entry = index[probe]
            physical = client.resfiles_dir / entry.hash_path
            report["probe"] = {
                "logicalPath": probe,
                "physicalPath": str(physical),
                "exists": physical.exists(),
                "size": physical.stat().st_size if physical.exists() else None,
            }
        else:
            report["probe"] = {"logicalPath": probe, "error": "not in index"}
    return report


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="extract.discover")
    parser.add_argument("--build", required=True, choices=["stillness", "utopia"])
    parser.add_argument("--client-path", type=Path, default=None,
                        help="Override auto-detected client root")
    parser.add_argument("--json", action="store_true", help="Emit JSON only")
    parser.add_argument("--probe", type=str, default=None,
                        help="Probe a single logical res:/... path")
    parser.add_argument("--out", type=Path, default=None,
                        help="Write report to this file instead of stdout")
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv or sys.argv[1:])
    try:
        client = resolve_client_root(build=args.build, override=args.client_path)
    except ClientNotFound as err:
        sys.stderr.write(f"{err}\n")
        return 2

    report = build_discovery_report(client, probe=args.probe)

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        if not args.json:
            sys.stdout.write(f"Discovery report written to {args.out}\n")
        return 0

    if args.json:
        json.dump(report, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        sys.stdout.write(f"Build: {report['clientRoot']['build']} ({report['clientRoot']['server']})\n")
        sys.stdout.write(f"Client root: {report['clientRoot']['root']}\n")
        sys.stdout.write(f"Index entries: {report['indexEntries']}\n")
        sys.stdout.write(f"Loaders: {len(report['loaders'])}\n")
        for name in sorted(report["loaders"]):
            sys.stdout.write(f"  - {name}\n")
        if "probe" in report:
            sys.stdout.write(f"Probe: {json.dumps(report['probe'], indent=2)}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
