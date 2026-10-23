"""validate CLI tests."""

import json
from pathlib import Path
from typing import List

import pytest

from extract.targets import _CLEAR_FOR_TESTS, register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)
from extract.validate import build_validation_report, write_validation_report


class _GoodTarget:
    NAME = "good"
    REQUIRED_RESOURCES: List[str] = []
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "good.json"
    DEPENDS_ON: List[str] = []

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        raise NotImplementedError

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        return []


class _BadTarget(_GoodTarget):
    NAME = "bad"

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "broken join")]


class _WarnTarget(_GoodTarget):
    NAME = "warn"

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        return [ValidationIssue(ValidationSeverity.WARNING, self.NAME, "weird")]


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


def _run_dir(tmp_path: Path) -> Path:
    rd = tmp_path / "run"
    (rd / "raw").mkdir(parents=True)
    return rd


def test_validation_passes_when_all_targets_clean(tmp_path: Path):
    register_target(_GoodTarget())
    report = build_validation_report(_client(tmp_path), _run_dir(tmp_path))
    assert report["status"] == "pass"
    assert report["errors"] == []
    assert report["warnings"] == []


def test_validation_fails_on_any_error(tmp_path: Path):
    register_target(_GoodTarget())
    register_target(_BadTarget())
    report = build_validation_report(_client(tmp_path), _run_dir(tmp_path))
    assert report["status"] == "fail"
    assert len(report["errors"]) == 1
    assert report["errors"][0]["target"] == "bad"


def test_validation_passes_with_warnings_only(tmp_path: Path):
    register_target(_GoodTarget())
    register_target(_WarnTarget())
    report = build_validation_report(_client(tmp_path), _run_dir(tmp_path))
    assert report["status"] == "pass"
    assert report["errors"] == []
    assert len(report["warnings"]) == 1


def test_write_validation_report_writes_file(tmp_path: Path):
    register_target(_GoodTarget())
    rd = _run_dir(tmp_path)
    report = build_validation_report(_client(tmp_path), rd)
    write_validation_report(report, rd)
    saved = json.loads((rd / "validation-report.json").read_text())
    assert saved["status"] == "pass"
