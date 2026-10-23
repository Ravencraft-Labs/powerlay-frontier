"""groups target — emit data/raw/groups.json via real CCP groupsLoader."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, List, Optional

from extract.loader import LoaderRegistry
from extract.localization import Localizer, load_localization
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

RESOURCE = "res:/staticdata/groups.fsdbinary"
LOADER_MODULE = "groupsLoader"


def _default_loader_factory(client: ClientRoot) -> Any:
    module = LoaderRegistry(client.bin_dir).get(LOADER_MODULE)
    if module is None:
        raise RuntimeError(
            f"Loader module {LOADER_MODULE!r} not found in {client.bin_dir}. "
            "On macOS, the CLI entry must call ensure_dyld_env_or_reexec() first."
        )
    return module


def _default_localizer_factory(client: ClientRoot) -> Localizer:
    return Localizer(mapping=load_localization(client, "en-us"), language="en-us")


class GroupsTarget:
    NAME = "groups"
    REQUIRED_RESOURCES = [RESOURCE]
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "groups.json"
    DEPENDS_ON: List[str] = []

    def __init__(
        self,
        *,
        loader_factory: Optional[Callable[[ClientRoot], Any]] = None,
        localizer_factory: Optional[Callable[[ClientRoot], Localizer]] = None,
    ):
        self._loader_factory = loader_factory or _default_loader_factory
        self._localizer_factory = localizer_factory or _default_localizer_factory

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
        localizer = self._localizer_factory(client)

        raw = loader.load(str(physical))

        output: dict[str, dict[str, Any]] = {}
        for group_id in raw:
            rec = raw[group_id]
            entry = record_to_dict(rec)
            entry["groupID"] = int(group_id)
            name_id = entry.get("groupNameID")
            entry["groupName_en-us"] = localizer.get(
                name_id if isinstance(name_id, int) else None
            )
            output[str(int(group_id))] = entry

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
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "output file missing")]
        data = json.loads(out_path.read_text(encoding="utf-8"))
        issues: List[ValidationIssue] = []
        if not data:
            issues.append(ValidationIssue(ValidationSeverity.ERROR, self.NAME, "no rows extracted"))
        for key, entry in list(data.items())[:50]:
            if "groupID" not in entry or "categoryID" not in entry:
                issues.append(ValidationIssue(
                    ValidationSeverity.ERROR, self.NAME,
                    f"row {key} missing groupID/categoryID"))
        return issues


register_target(GroupsTarget())
