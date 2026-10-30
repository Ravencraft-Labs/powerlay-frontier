"""ExtractManifest round-trip tests."""

import json
from pathlib import Path

from extract.manifest import ExtractManifest, TargetSummary, save_manifest, load_manifest


def test_manifest_save_and_load_round_trip(tmp_path: Path):
    manifest = ExtractManifest(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        client_root="/Users/x/Library/Application Support/EVE Frontier/SharedCache/stillness",
        extracted_at="2026-06-06T16:42:11Z",
        python_version="3.12.4",
        platform="darwin",
        script_version="git:5dcd3af",
        targets={
            "types": TargetSummary(
                status="ok",
                source_path="res:/staticdata/types.fsdbinary",
                source_hash="deadbeef",
                row_count=47812,
            ),
            "icons": TargetSummary(status="skipped", reason="icons dir missing"),
        },
    )
    path = tmp_path / "manifest.json"
    save_manifest(manifest, path)

    raw = json.loads(path.read_text())
    assert raw["build"] == "stillness"
    assert raw["targets"]["types"]["rowCount"] == 47812
    assert raw["targets"]["icons"]["status"] == "skipped"

    loaded = load_manifest(path)
    assert loaded == manifest


def test_target_summary_optional_fields(tmp_path: Path):
    summary = TargetSummary(status="ok")
    manifest = ExtractManifest(
        build="utopia",
        server="utopia.servers.evefrontier.com",
        client_root="/tmp/x",
        extracted_at="2026-06-06T00:00:00Z",
        python_version="3.12.0",
        platform="win32",
        script_version="git:unknown",
        targets={"types": summary},
    )
    path = tmp_path / "m.json"
    save_manifest(manifest, path)
    raw = json.loads(path.read_text())
    assert raw["targets"]["types"] == {"status": "ok"}
