"""solarsystems target — emit data/raw/solarsystems.json array shape.

Source: `res:/staticdata/systems.static` + `res:/staticdata/systems.schema`
read via CCP `binaryLoader` (pure Python in `code.ccp`). Joined with
localization for human-readable names.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, List, Optional

from extract.localization import Localizer, load_localization
from extract.resindex import parse_resindex
from extract.static_loader import load_static_with_schema
from extract.targets import register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)

STATIC_RESOURCE = "res:/staticdata/systems.static"
SCHEMA_RESOURCE = "res:/staticdata/systems.schema"


def _default_loader_factory(client: ClientRoot, static_path: Path, schema_path: Path) -> Any:
    return load_static_with_schema(client, static_path, schema_path)


def _default_localizer_factory(client: ClientRoot) -> Localizer:
    return Localizer(mapping=load_localization(client, "en-us"), language="en-us")


LoaderFactory = Callable[[ClientRoot, Path, Path], Any]


class SolarsystemsTarget:
    NAME = "solarsystems"
    REQUIRED_RESOURCES = [STATIC_RESOURCE, SCHEMA_RESOURCE]
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "solarsystems.json"
    DEPENDS_ON: List[str] = []

    def __init__(
        self,
        *,
        loader_factory: Optional[LoaderFactory] = None,
        localizer_factory: Optional[Callable[[ClientRoot], Localizer]] = None,
    ):
        self._loader_factory = loader_factory or _default_loader_factory
        self._localizer_factory = localizer_factory or _default_localizer_factory

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        if STATIC_RESOURCE not in index:
            return AvailabilityResult.missing(f"{STATIC_RESOURCE} not in resfileindex")
        if SCHEMA_RESOURCE not in index:
            return AvailabilityResult.missing(f"{SCHEMA_RESOURCE} not in resfileindex")
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        availability = self.is_available(client)
        if not availability.available:
            return ExtractResult(status="skipped", error=availability.reason)

        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        static_path = index.resolve(STATIC_RESOURCE, client.resfiles_dir)
        schema_path = index.resolve(SCHEMA_RESOURCE, client.resfiles_dir)

        records = self._loader_factory(client, static_path, schema_path)
        localizer = self._localizer_factory(client)

        rows: list[dict[str, Any]] = []
        for system_id in records:
            rec = records[system_id]
            name_id = getattr(rec, "nameID", None)
            constellation_id = getattr(rec, "constellationID", 0)
            region_id = getattr(rec, "regionID", 0)
            center = getattr(rec, "center", None)
            coords: list[float] = []
            if center is not None:
                data = getattr(center, "data", center)
                try:
                    coords = [float(c) for c in data]
                except TypeError:
                    coords = []
            rows.append({
                "id": int(system_id),
                "name": localizer.get(name_id if isinstance(name_id, int) else None),
                "constellationId": int(constellation_id),
                "regionId": int(region_id),
                "location": coords,
            })
        rows.sort(key=lambda r: r["id"])

        out_dir = run_dir / "raw"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / self.OUTPUT_FILENAME
        out_path.write_text(json.dumps(rows), encoding="utf-8")

        return ExtractResult(
            status="ok",
            output_path=out_path,
            row_count=len(rows),
            source_path=STATIC_RESOURCE,
        )

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        out_path = run_dir / "raw" / self.OUTPUT_FILENAME
        if not out_path.exists():
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "output missing")]
        data = json.loads(out_path.read_text(encoding="utf-8"))
        if not isinstance(data, list) or not data:
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "empty or wrong-shape")]
        issues: List[ValidationIssue] = []
        for row in data[:50]:
            if not all(k in row for k in ("id", "name", "constellationId", "regionId", "location")):
                issues.append(ValidationIssue(
                    ValidationSeverity.ERROR, self.NAME,
                    f"row missing required keys: {row}"))
                break
        return issues


register_target(SolarsystemsTarget())
