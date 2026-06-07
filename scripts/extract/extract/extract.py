"""extract CLI: produce a timestamped run-dir with raw target outputs + manifest."""

from __future__ import annotations

import argparse
import datetime as dt
import logging
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

from extract.loader import ensure_dyld_env_or_reexec
from extract.manifest import ExtractManifest, TargetSummary, save_manifest
from extract.paths import ClientNotFound, resolve_client_root
from extract.targets import registry_snapshot, topological_order
from extract.types import ClientRoot, ExtractResult

LOG = logging.getLogger("extract")


def _git_short_sha() -> str:
    try:
        return "git:" + subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "git:unknown"


def _import_all_targets() -> None:
    """Force-import every target module so its register_target() runs."""
    from extract.targets import (  # noqa: F401
        types as _types,
        groups as _groups,
        industry_blueprints as _bp,
        industry_facilities as _fac,
        solarsystems as _ss,
        spacecomponents as _sc,
        icons as _icons,
    )


def _now_utc_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ts_for_dir(now: str) -> str:
    return now.replace("-", "").replace(":", "").replace("T", "-").replace("Z", "")


def run_extract(
    *,
    client: ClientRoot,
    runs_root: Path,
    target_names: Optional[List[str]],
    now: str,
    script_version: str,
) -> Path:
    registry = registry_snapshot()
    if not registry:
        raise RuntimeError("no targets registered — import target modules first")

    if target_names is not None:
        for name in target_names:
            if name not in registry:
                raise ValueError(f"unknown target {name!r} (have: {sorted(registry)})")
        wanted = set(target_names)
        ordered = [t for t in topological_order() if t.NAME in wanted]
    else:
        ordered = topological_order()

    run_dir = runs_root / f"{client.build}-{client.server}-{_ts_for_dir(now)}"
    (run_dir / "raw").mkdir(parents=True, exist_ok=True)
    log_path = run_dir / "extract.log"
    logging.basicConfig(filename=log_path, level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    summaries: dict[str, TargetSummary] = {}
    for target in ordered:
        LOG.info("running target %s", target.NAME)
        try:
            result: ExtractResult = target.extract(client, run_dir)
        except Exception as err:
            LOG.exception("target %s failed", target.NAME)
            summaries[target.NAME] = TargetSummary(status="fail", reason=str(err))
            continue
        summaries[target.NAME] = TargetSummary(
            status=result.status,
            source_path=result.source_path,
            source_hash=result.source_hash,
            row_count=result.row_count if result.row_count else None,
            reason=result.error,
        )

    manifest = ExtractManifest(
        build=client.build, server=client.server,
        client_root=str(client.root), extracted_at=now,
        python_version=".".join(map(str, sys.version_info[:3])),
        platform=client.platform, script_version=script_version,
        targets=summaries,
    )
    save_manifest(manifest, run_dir / "manifest.json")
    return run_dir


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="extract.extract")
    p.add_argument("--build", required=True, choices=["stillness", "utopia"])
    p.add_argument("--client-path", type=Path, default=None)
    p.add_argument("--target", action="append", default=None,
                   help="Target name (repeatable). Omit to run all.")
    p.add_argument("--all", action="store_true", help="Explicitly run all targets")
    p.add_argument("--runs-root", type=Path, default=Path("data/extracted"))
    return p.parse_args(argv)


def _fixup_argv_for_module_reexec() -> None:
    """If we were launched via ``python -m extract.extract``, sys.argv[0] is the
    file path. ``ensure_dyld_env_or_reexec`` would then re-exec the file directly,
    causing ``extract.py`` to shadow the ``extract`` package. Rewrite sys.argv to
    ``['-m', 'extract.extract', *rest]`` so the re-exec keeps -m semantics.
    """
    spec = getattr(sys.modules.get("__main__"), "__spec__", None)
    if spec is None:
        return  # plain script invocation
    module_name = spec.name
    sys.argv[:] = ["-m", module_name, *sys.argv[1:]]


def main(argv: Optional[list[str]] = None) -> int:
    _fixup_argv_for_module_reexec()
    ensure_dyld_env_or_reexec()  # re-exec on macOS if DYLD_LIBRARY_PATH missing
    # After _fixup_argv_for_module_reexec, sys.argv may look like
    # ``[-m, <module>, ...real CLI args]``. Strip the leading -m/module pair
    # before argparse sees it.
    if argv is None:
        cli_argv = list(sys.argv)
        if len(cli_argv) >= 2 and cli_argv[0] == "-m":
            cli_argv = cli_argv[2:]
        else:
            cli_argv = cli_argv[1:]
    else:
        cli_argv = argv
    args = _parse_args(cli_argv)
    _import_all_targets()
    try:
        client = resolve_client_root(build=args.build, override=args.client_path)
    except ClientNotFound as err:
        sys.stderr.write(f"{err}\n")
        return 2

    target_names = None if (args.all or args.target is None) else args.target
    run_dir = run_extract(
        client=client,
        runs_root=args.runs_root,
        target_names=target_names,
        now=_now_utc_iso(),
        script_version=_git_short_sha(),
    )
    sys.stdout.write(f"Run directory: {run_dir}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
