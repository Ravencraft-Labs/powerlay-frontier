"""Shared dataclass smoke tests."""

from pathlib import Path

import pytest

from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    IndexEntry,
    ValidationIssue,
    ValidationSeverity,
)


def test_client_root_is_frozen():
    root = ClientRoot(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        root=Path("/tmp/x"),
        stillness_dir=Path("/tmp/x/stillness"),
        resfiles_dir=Path("/tmp/x/ResFiles"),
        bin_dir=Path("/tmp/x/bin64"),
        platform="darwin",
    )
    with pytest.raises(Exception):
        root.build = "utopia"  # type: ignore[misc]


def test_index_entry_holds_resource_metadata():
    entry = IndexEntry(
        logical_path="res:/staticdata/types.fsdbinary",
        hash_path="ab/abcd1234deadbeef",
        file_hash="abcd1234deadbeef",
        offset=0,
        size=12345,
    )
    assert entry.hash_path.startswith("ab/")


def test_availability_result_distinguishes_states():
    ok = AvailabilityResult.ok()
    missing = AvailabilityResult.missing("types.fsdbinary not in index")
    assert ok.available is True
    assert missing.available is False
    assert "not in index" in (missing.reason or "")


def test_extract_result_carries_counts_and_errors():
    res = ExtractResult(status="ok", output_path=Path("/tmp/x.json"), row_count=42)
    assert res.status == "ok"
    assert res.row_count == 42
    assert res.error is None


def test_validation_issue_levels():
    err = ValidationIssue(severity=ValidationSeverity.ERROR, target="types", message="x")
    warn = ValidationIssue(severity=ValidationSeverity.WARNING, target="groups", message="y")
    assert err.severity == ValidationSeverity.ERROR
    assert warn.severity == ValidationSeverity.WARNING
