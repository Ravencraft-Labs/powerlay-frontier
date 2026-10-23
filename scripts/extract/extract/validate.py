"""validate CLI: gate before promote."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from extract.loader import ensure_dyld_env_or_reexec
from extract.manifest import load_manifest
from extract.paths import resolve_client_root
from extract.targets import registry_snapshot
from extract.types import ClientRoot, ValidationSeverity


def build_validation_report(client: ClientRoot, run_dir: Path) -> Dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    for target in registry_snapshot().values():
        for issue in target.validate(client, run_dir):
            row = {"target": issue.target, "message": issue.message}
            if issue.severity == ValidationSeverity.ERROR:
                errors.append(row)
            else:
                warnings.append(row)

    status = "pass" if not errors else "fail"
    return {
        "status": status,
        "errors": errors,
        "warnings": warnings,
        "runDir": str(run_dir),
    }


def write_validation_report(report: Dict[str, Any], run_dir: Path) -> Path:
    out = run_dir / "validation-report.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return out


def _import_all_targets() -> None:
    from extract.targets import (  # noqa: F401
        types as _t, groups as _g,
        industry_blueprints as _bp, industry_facilities as _fac,
        solarsystems as _ss, spacecomponents as _sc, icons as _ic,
    )


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="extract.validate")
    p.add_argument("run_dir", type=Path)
    p.add_argument("--client-path", type=Path, default=None,
                   help="Override; otherwise read from manifest.json")
    return p.parse_args(argv)


def _fixup_argv_for_module_reexec() -> None:
    """If launched via ``python -m extract.validate``, sys.argv[0] is the file
    path. ``ensure_dyld_env_or_reexec`` would then re-exec the file directly,
    which makes ``extract`` look like a script rather than a package. Rewrite
    sys.argv to ``['-m', 'extract.validate', *rest]`` so re-exec preserves -m.
    """
    spec = getattr(sys.modules.get("__main__"), "__spec__", None)
    if spec is None:
        return
    module_name = spec.name
    sys.argv[:] = ["-m", module_name, *sys.argv[1:]]


def main(argv: Optional[list[str]] = None) -> int:
    _fixup_argv_for_module_reexec()
    ensure_dyld_env_or_reexec()
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
    manifest = load_manifest(args.run_dir / "manifest.json")
    client = resolve_client_root(
        build=manifest.build,  # type: ignore[arg-type]
        override=args.client_path or Path(manifest.client_root),
    )
    report = build_validation_report(client, args.run_dir)
    out_path = write_validation_report(report, args.run_dir)
    sys.stdout.write(f"Validation: {report['status']} ({len(report['errors'])} errors, "
                     f"{len(report['warnings'])} warnings). Report: {out_path}\n")
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
