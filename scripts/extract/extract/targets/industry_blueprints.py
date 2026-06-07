"""industry_blueprints target — emit data/raw/industry_blueprints.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, List, Optional

from extract.loader import LoaderRegistry
from extract.resindex import parse_resindex
from extract.targets import register_target
from extract.targets._cfsd import record_to_dict
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)

RESOURCE = "res:/staticdata/industry_blueprints.fsdbinary"
LOADER_MODULE = "industry_blueprintsLoader"


def _default_loader_factory(client: ClientRoot) -> Any:
    module = LoaderRegistry(client.bin_dir).get(LOADER_MODULE)
    if module is None:
        raise RuntimeError(
            f"Loader module {LOADER_MODULE!r} not found in {client.bin_dir}. "
            "On macOS, the CLI entry must call ensure_dyld_env_or_reexec() first."
        )
    return module


class IndustryBlueprintsTarget:
    NAME = "industry_blueprints"
    REQUIRED_RESOURCES = [RESOURCE]
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "industry_blueprints.json"
    DEPENDS_ON: List[str] = []

    def __init__(
        self,
        *,
        loader_factory: Optional[Callable[[ClientRoot], Any]] = None,
    ):
        self._loader_factory = loader_factory or _default_loader_factory

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        if RESOURCE not in index:
            return AvailabilityResult.missing(f"{RESOURCE} not in resfileindex")
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        availability = self.is_available(client)
        if not availability.available:
            return ExtractResult(status="skipped", error=availability.reason)

        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        physical = index.resolve(RESOURCE, client.resfiles_dir)
        loader = self._loader_factory(client)

        raw = loader.load(str(physical))

        output: dict[str, dict[str, Any]] = {}
        for bp_id in raw:
            rec = raw[bp_id]
            entry = record_to_dict(rec)
            output[str(int(bp_id))] = entry

        out_dir = run_dir / "raw"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / self.OUTPUT_FILENAME
        out_path.write_text(json.dumps(output), encoding="utf-8")

        return ExtractResult(
            status="ok",
            output_path=out_path,
            row_count=len(output),
            source_path=RESOURCE,
        )

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        out_path = run_dir / "raw" / self.OUTPUT_FILENAME
        if not out_path.exists():
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "output missing")]
        data = json.loads(out_path.read_text(encoding="utf-8"))
        issues: List[ValidationIssue] = []
        if not data:
            issues.append(ValidationIssue(ValidationSeverity.ERROR, self.NAME, "no blueprints"))
        # Join: every input/output typeID must appear in types.json (if present).
        types_path = run_dir / "raw" / "types.json"
        if types_path.exists():
            types_keys = set(json.loads(types_path.read_text(encoding="utf-8")).keys())
            missing: set[str] = set()
            for record in data.values():
                for entry in list(record.get("inputs", [])) + list(record.get("outputs", [])):
                    type_id_key = str(entry["typeID"])
                    if type_id_key not in types_keys:
                        missing.add(type_id_key)
            if missing:
                issues.append(ValidationIssue(
                    ValidationSeverity.ERROR, self.NAME,
                    f"{len(missing)} typeIDs referenced by blueprints missing from types"))
        return issues


register_target(IndustryBlueprintsTarget())
