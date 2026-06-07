"""Per-run extraction manifest (JSON on disk)."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, Literal, Optional


@dataclass(frozen=True)
class TargetSummary:
    status: Literal["ok", "skipped", "fail"]
    source_path: Optional[str] = None
    source_hash: Optional[str] = None
    row_count: Optional[int] = None
    reason: Optional[str] = None


@dataclass(frozen=True)
class ExtractManifest:
    build: str
    server: str
    client_root: str
    extracted_at: str
    python_version: str
    platform: str
    script_version: str
    targets: Dict[str, TargetSummary] = field(default_factory=dict)


_SUMMARY_KEYS = {
    "status": "status",
    "source_path": "sourcePath",
    "source_hash": "sourceHash",
    "row_count": "rowCount",
    "reason": "reason",
}

_REVERSE_SUMMARY_KEYS = {v: k for k, v in _SUMMARY_KEYS.items()}


def _summary_to_json(summary: TargetSummary) -> Dict[str, object]:
    out: Dict[str, object] = {}
    for py_key, json_key in _SUMMARY_KEYS.items():
        value = getattr(summary, py_key)
        if value is not None:
            out[json_key] = value
    return out


def _summary_from_json(raw: Dict[str, object]) -> TargetSummary:
    kwargs: Dict[str, object] = {}
    for json_key, value in raw.items():
        py_key = _REVERSE_SUMMARY_KEYS.get(json_key)
        if py_key:
            kwargs[py_key] = value
    return TargetSummary(**kwargs)  # type: ignore[arg-type]


def save_manifest(manifest: ExtractManifest, path: Path) -> None:
    payload = {
        "build": manifest.build,
        "server": manifest.server,
        "clientRoot": manifest.client_root,
        "extractedAt": manifest.extracted_at,
        "pythonVersion": manifest.python_version,
        "platform": manifest.platform,
        "scriptVersion": manifest.script_version,
        "targets": {name: _summary_to_json(s) for name, s in manifest.targets.items()},
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_manifest(path: Path) -> ExtractManifest:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return ExtractManifest(
        build=raw["build"],
        server=raw["server"],
        client_root=raw["clientRoot"],
        extracted_at=raw["extractedAt"],
        python_version=raw["pythonVersion"],
        platform=raw["platform"],
        script_version=raw["scriptVersion"],
        targets={name: _summary_from_json(s) for name, s in raw["targets"].items()},
    )
