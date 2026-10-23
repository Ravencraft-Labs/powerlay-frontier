"""update_static_data: end-to-end orchestration for pre-release runs."""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path
from typing import Optional

from extract.extract import (
    _git_short_sha, _import_all_targets, _now_utc_iso, run_extract,
)
from extract.loader import ensure_dyld_env_or_reexec
from extract.paths import ClientNotFound, resolve_client_root
from extract.promote import PromoteRefused, promote_run
from extract.types import ClientRoot
from extract.validate import build_validation_report, write_validation_report


def _confirm(prompt: str) -> bool:
    answer = input(prompt).strip().lower()
    return answer in {"y", "yes"}


def _now_dir_ts() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")


def run_pipeline(
    *,
    client: ClientRoot,
    runs_root: Path,
    raw_dir: Path,
    yes: bool,
) -> int:
    sys.stdout.write(f"[1/4] discover (implicit via paths): {client.root}\n")
    sys.stdout.write("[2/4] extract...\n")
    run_dir = run_extract(
        client=client, runs_root=runs_root, target_names=None,
        now=_now_utc_iso(), script_version=_git_short_sha(),
    )
    sys.stdout.write(f"      run-dir: {run_dir}\n")

    sys.stdout.write("[3/4] validate...\n")
    report = build_validation_report(client, run_dir)
    write_validation_report(report, run_dir)
    sys.stdout.write(
        f"      status: {report['status']} "
        f"({len(report['errors'])} errors, {len(report['warnings'])} warnings)\n"
    )
    if report["status"] != "pass":
        sys.stderr.write("Validation failed; not promoting. Inspect "
                         f"{run_dir / 'validation-report.json'}.\n")
        return 1

    if not yes:
        if not _confirm(f"Promote {run_dir} to {raw_dir}? [y/N] "):
            sys.stdout.write("Aborted by user.\n")
            return 3

    sys.stdout.write("[4/4] promote...\n")
    try:
        promote_run(run_dir=run_dir, raw_dir=raw_dir, now=_now_dir_ts())
    except PromoteRefused as err:
        sys.stderr.write(f"refused: {err}\n")
        return 1
    sys.stdout.write(f"Promoted to {raw_dir}\n")
    return 0


def _fixup_argv_for_module_reexec() -> None:
    """If launched via ``python -m extract.update_static_data``, sys.argv[0] is
    the file path. Re-execing through os.execvpe with that argv reruns the
    file directly, which makes the ``extract`` package un-importable. Rewrite
    sys.argv to ``['-m', 'extract.update_static_data', *rest]`` so re-exec
    preserves the -m invocation."""
    if not sys.argv:
        return
    if sys.argv[0] in ("-m", ""):
        return
    if not sys.argv[0].endswith("update_static_data.py"):
        return
    module_name = "extract.update_static_data"
    sys.argv[:] = ["-m", module_name, *sys.argv[1:]]


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="extract.update_static_data")
    p.add_argument("--build", required=True, choices=["stillness", "utopia"])
    p.add_argument("--client-path", type=Path, default=None)
    p.add_argument("--runs-root", type=Path, default=Path("data/extracted"))
    p.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    p.add_argument("--yes", action="store_true",
                   help="Skip promote confirmation (for scripts/CI)")
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    _fixup_argv_for_module_reexec()
    ensure_dyld_env_or_reexec()
    if argv is None:
        cli_argv = list(sys.argv)
        if cli_argv and cli_argv[0] == "-m":
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
    return run_pipeline(
        client=client, runs_root=args.runs_root,
        raw_dir=args.raw_dir, yes=args.yes,
    )


if __name__ == "__main__":
    raise SystemExit(main())
