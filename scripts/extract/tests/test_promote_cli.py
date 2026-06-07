"""promote CLI tests."""

import json
from pathlib import Path

import pytest

from extract.promote import PromoteRefused, promote_run


def _seed_run_dir(tmp_path: Path, status: str = "pass") -> Path:
    rd = tmp_path / "run"
    (rd / "raw").mkdir(parents=True)
    (rd / "raw" / "types.json").write_text(json.dumps({"1": {"typeID": 1}}), encoding="utf-8")
    (rd / "raw" / "industry_blueprints.json").write_text(json.dumps({}), encoding="utf-8")
    (rd / "raw" / "icons").mkdir()
    (rd / "raw" / "icons" / "1.png").write_bytes(b"PNG")
    (rd / "manifest.json").write_text(json.dumps({
        "build": "stillness", "server": "x", "clientRoot": "/tmp/x",
        "extractedAt": "2026-06-06T00:00:00Z", "pythonVersion": "3.12.0",
        "platform": "darwin", "scriptVersion": "git:x", "targets": {},
    }), encoding="utf-8")
    (rd / "validation-report.json").write_text(json.dumps({
        "status": status, "errors": [], "warnings": [], "runDir": str(rd),
    }), encoding="utf-8")
    return rd


def test_promote_refuses_when_validation_failed(tmp_path: Path):
    rd = _seed_run_dir(tmp_path, status="fail")
    with pytest.raises(PromoteRefused, match="validation"):
        promote_run(run_dir=rd, raw_dir=tmp_path / "data" / "raw",
                    now="20260606-000000")


def test_promote_refuses_when_validation_report_missing(tmp_path: Path):
    rd = tmp_path / "run"
    (rd / "raw").mkdir(parents=True)
    with pytest.raises(PromoteRefused, match="validation-report"):
        promote_run(run_dir=rd, raw_dir=tmp_path / "data" / "raw",
                    now="20260606-000000")


def test_promote_moves_existing_raw_to_backup(tmp_path: Path):
    rd = _seed_run_dir(tmp_path)
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    (raw_dir / "old.json").write_text("old", encoding="utf-8")

    promote_run(run_dir=rd, raw_dir=raw_dir, now="20260606-000000")

    backup_dir = raw_dir.parent / "raw.bak.20260606-000000"
    assert backup_dir.exists()
    assert (backup_dir / "old.json").read_text() == "old"
    assert (raw_dir / "types.json").exists()
    assert (raw_dir / "icons" / "1.png").exists()
    source = json.loads((raw_dir / ".source.json").read_text())
    assert source["runDir"] == str(rd)


def test_promote_rolls_single_backup(tmp_path: Path):
    rd = _seed_run_dir(tmp_path)
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    (raw_dir / "old.json").write_text("old", encoding="utf-8")
    older_backup = raw_dir.parent / "raw.bak.20260101-000000"
    older_backup.mkdir()
    (older_backup / "ancient.json").write_text("a", encoding="utf-8")

    promote_run(run_dir=rd, raw_dir=raw_dir, now="20260606-000000")

    assert not older_backup.exists(), "older backup must be pruned"
    assert (raw_dir.parent / "raw.bak.20260606-000000").exists()


def test_promote_creates_raw_dir_when_absent(tmp_path: Path):
    rd = _seed_run_dir(tmp_path)
    raw_dir = tmp_path / "data" / "raw"
    promote_run(run_dir=rd, raw_dir=raw_dir, now="20260606-000000")
    assert (raw_dir / "types.json").exists()
