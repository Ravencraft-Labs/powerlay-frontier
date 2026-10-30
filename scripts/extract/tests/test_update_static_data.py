"""update_static_data orchestrator test (no real client)."""

import json
from pathlib import Path
from typing import List
from unittest.mock import patch

import pytest

from extract.targets import _CLEAR_FOR_TESTS, register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
)
from extract.update_static_data import run_pipeline


class _TrivialTarget:
    NAME = "trivial"
    REQUIRED_RESOURCES: List[str] = []
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "trivial.json"
    DEPENDS_ON: List[str] = []

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        out = run_dir / "raw" / self.OUTPUT_FILENAME
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"k": 1}), encoding="utf-8")
        return ExtractResult(status="ok", output_path=out, row_count=1)

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        return []


@pytest.fixture(autouse=True)
def _reset():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _client(tmp_path: Path) -> ClientRoot:
    return ClientRoot(
        build="stillness", server="x",
        root=tmp_path, stillness_dir=tmp_path,
        resfiles_dir=tmp_path, bin_dir=None, platform="darwin",
    )


def test_pipeline_extract_validate_promote_happy_path(tmp_path: Path):
    register_target(_TrivialTarget())
    raw_dir = tmp_path / "data" / "raw"
    runs_root = tmp_path / "data" / "extracted"

    rc = run_pipeline(
        client=_client(tmp_path),
        runs_root=runs_root,
        raw_dir=raw_dir,
        yes=True,
    )
    assert rc == 0
    assert (raw_dir / "trivial.json").exists()
    assert (raw_dir / ".source.json").exists()


def test_pipeline_aborts_when_user_says_no(tmp_path: Path):
    register_target(_TrivialTarget())
    raw_dir = tmp_path / "data" / "raw"
    runs_root = tmp_path / "data" / "extracted"

    with patch("extract.update_static_data._confirm", return_value=False):
        rc = run_pipeline(
            client=_client(tmp_path),
            runs_root=runs_root,
            raw_dir=raw_dir,
            yes=False,
        )
    assert rc == 3
    assert not raw_dir.exists()


def test_pipeline_returns_1_when_validation_fails(tmp_path: Path):
    class _BadTarget(_TrivialTarget):
        NAME = "bad"
        OUTPUT_FILENAME = "bad.json"

        def validate(self, client, run_dir):
            from extract.types import ValidationIssue, ValidationSeverity
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "broken")]

    register_target(_BadTarget())
    raw_dir = tmp_path / "data" / "raw"
    runs_root = tmp_path / "data" / "extracted"

    rc = run_pipeline(
        client=_client(tmp_path),
        runs_root=runs_root,
        raw_dir=raw_dir,
        yes=True,
    )
    assert rc == 1
    assert not raw_dir.exists()
