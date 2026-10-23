"""promote CLI: copy a validated run into data/raw/."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import sys
from pathlib import Path
from typing import Optional


class PromoteRefused(RuntimeError):
    pass


def _now_dir_ts() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")


def _prune_old_backups(raw_parent: Path, keep_name: str) -> None:
    for entry in raw_parent.iterdir():
        if entry.name.startswith("raw.bak.") and entry.name != keep_name:
            shutil.rmtree(entry)


def promote_run(*, run_dir: Path, raw_dir: Path, now: str) -> None:
    report_path = run_dir / "validation-report.json"
    if not report_path.exists():
        raise PromoteRefused(f"validation-report.json missing at {report_path}")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("status") != "pass":
        raise PromoteRefused(
            f"validation status is {report.get('status')!r}; refusing promote"
        )

    raw_parent = raw_dir.parent
    raw_parent.mkdir(parents=True, exist_ok=True)

    if raw_dir.exists():
        backup_name = f"raw.bak.{now}"
        suffix = 0
        candidate = raw_parent / backup_name
        while candidate.exists():
            suffix += 1
            candidate = raw_parent / f"{backup_name}.{suffix}"
        shutil.move(str(raw_dir), str(candidate))
        _prune_old_backups(raw_parent, candidate.name)

    raw_dir.mkdir(parents=True)
    source_raw = run_dir / "raw"
    for entry in source_raw.iterdir():
        dest = raw_dir / entry.name
        if entry.is_dir():
            shutil.copytree(entry, dest)
        else:
            shutil.copy2(entry, dest)

    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    (raw_dir / ".source.json").write_text(json.dumps({
        "runDir": str(run_dir),
        "manifest": manifest,
        "promotedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }, indent=2), encoding="utf-8")


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="extract.promote")
    p.add_argument("run_dir", type=Path)
    p.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv or sys.argv[1:])
    try:
        promote_run(run_dir=args.run_dir, raw_dir=args.raw_dir, now=_now_dir_ts())
    except PromoteRefused as err:
        sys.stderr.write(f"refused: {err}\n")
        return 1
    sys.stdout.write(f"Promoted {args.run_dir} -> {args.raw_dir}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
