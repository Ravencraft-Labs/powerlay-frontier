"""extract CLI tests using injected dummy registry."""

import json
from pathlib import Path
from typing import List

import pytest

from extract.extract import run_extract
from extract.targets import _CLEAR_FOR_TESTS, register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
)


class _DummyTarget:
    NAME = "dummy"
    REQUIRED_RESOURCES: List[str] = []
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "dummy.json"
    DEPENDS_ON: List[str] = []

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        out = run_dir / "raw" / self.OUTPUT_FILENAME
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"hi": "there"}), encoding="utf-8")
        return ExtractResult(status="ok", output_path=out, row_count=1, source_path="res:/x")

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        return []


@pytest.fixture(autouse=True)
def _reset():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _client(tmp_path: Path) -> ClientRoot:
    return ClientRoot(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        root=tmp_path / "c",
        stillness_dir=tmp_path / "c" / "stillness",
        resfiles_dir=tmp_path / "rf",
        bin_dir=None,
        platform="darwin",
    )


def test_run_extract_creates_run_dir_with_manifest(tmp_path: Path):
    register_target(_DummyTarget())
    runs_root = tmp_path / "runs"

    run_dir = run_extract(
        client=_client(tmp_path),
        runs_root=runs_root,
        target_names=None,
        now="2026-06-06T16:42:11Z",
        script_version="git:test",
    )

    assert run_dir.exists()
    assert (run_dir / "raw" / "dummy.json").exists()
    manifest = json.loads((run_dir / "manifest.json").read_text())
    assert manifest["build"] == "stillness"
    assert manifest["targets"]["dummy"]["status"] == "ok"
    assert manifest["targets"]["dummy"]["rowCount"] == 1


def test_run_extract_target_subset(tmp_path: Path):
    register_target(_DummyTarget())
    runs_root = tmp_path / "runs"
    run_dir = run_extract(
        client=_client(tmp_path), runs_root=runs_root,
        target_names=["dummy"], now="2026-06-06T16:42:11Z",
        script_version="git:test",
    )
    assert (run_dir / "raw" / "dummy.json").exists()


def test_run_extract_unknown_target_raises(tmp_path: Path):
    register_target(_DummyTarget())
    with pytest.raises(ValueError, match="unknown target"):
        run_extract(
            client=_client(tmp_path), runs_root=tmp_path / "r",
            target_names=["nope"], now="2026-06-06T16:42:11Z",
            script_version="git:test",
        )


def test_run_extract_captures_target_failure_in_manifest(tmp_path: Path):
    """One target failing must not crash the whole run; manifest reflects it."""

    class _BrokenTarget(_DummyTarget):
        NAME = "broken"
        OUTPUT_FILENAME = "broken.json"

        def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
            raise RuntimeError("loader exploded")

    register_target(_DummyTarget())
    register_target(_BrokenTarget())

    run_dir = run_extract(
        client=_client(tmp_path), runs_root=tmp_path / "r",
        target_names=None, now="2026-06-06T16:42:11Z",
        script_version="git:test",
    )
    manifest = json.loads((run_dir / "manifest.json").read_text())
    assert manifest["targets"]["dummy"]["status"] == "ok"
    assert manifest["targets"]["broken"]["status"] == "fail"
    assert "loader exploded" in (manifest["targets"]["broken"].get("reason") or "")
