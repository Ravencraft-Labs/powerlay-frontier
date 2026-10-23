"""ecosystem + systemstate target tests."""

import json
from pathlib import Path

import pytest

from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.ecosystem import EcosystemTarget
from extract.targets.systemstate import SystemStateTarget
from extract.types import ClientRoot


@pytest.fixture(autouse=True)
def _reset():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _client(tmp_path: Path, resource: str) -> ClientRoot:
    stillness = tmp_path / "c" / "stillness"
    bin_dir = stillness / "bin64"
    resfiles = tmp_path / "rf"
    bin_dir.mkdir(parents=True)
    (resfiles / "22").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        f"res:/staticdata/{resource},22/f.bin,h,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "22" / "f.bin").write_bytes(b"\x00" * 10)
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


class _Rec:
    def __init__(self, **kw):
        self._f = dict(kw)
    def __dir__(self):
        return list(self._f.keys())
    def __getattr__(self, n):
        if n in self._f:
            return self._f[n]
        raise AttributeError(n)


class _Loader:
    def __init__(self, recs):
        self._recs = recs
    def load(self, _p):
        return self._recs


def _factory(recs):
    fake = _Loader(recs)
    return lambda _c: fake


def test_ecosystem_emits_nested_patterns(tmp_path: Path):
    records = {
        42: _Rec(
            name="Broken World - Inner Belt - Ossuary Mill (Refinery - Ruins)",
            spawnEnabled=1,
            requireAllTags=["belt", "rocky"],
            entryPattern=_Rec(beaconTypeID=97278, baseCloudTypeID=1),
            brokenWorldPatterns=[_Rec(dungeonID=13606, maxOccurrences=1, minOccurrences=0, weight=0.5)],
        )
    }
    run_dir = tmp_path / "run"
    target = EcosystemTarget(loader_factory=_factory(records))
    client = _client(tmp_path, "ecosystem.fsdbinary")
    result = target.extract(client, run_dir)
    assert result.status == "ok"
    data = json.loads((run_dir / "raw" / "ecosystem.json").read_text())
    assert data["42"]["entryPattern"]["beaconTypeID"] == 97278
    assert data["42"]["requireAllTags"] == ["belt", "rocky"]
    assert data["42"]["brokenWorldPatterns"][0]["dungeonID"] == 13606
    assert target.validate(client, run_dir) == []


def test_systemstate_emits_state_by_system(tmp_path: Path):
    records = {30022528: _Rec(state="DEVASTATED"), 30000001: _Rec(state="SETTLED")}
    run_dir = tmp_path / "run"
    target = SystemStateTarget(loader_factory=_factory(records))
    result = target.extract(_client(tmp_path, "systemstate.fsdbinary"), run_dir)
    assert result.status == "ok"
    assert result.row_count == 2
    data = json.loads((run_dir / "raw" / "systemstate.json").read_text())
    assert data == {"30022528": {"state": "DEVASTATED"}, "30000001": {"state": "SETTLED"}}


def test_skip_when_resource_missing(tmp_path: Path):
    client = _client(tmp_path, "other.fsdbinary")
    assert not EcosystemTarget(loader_factory=_factory({})).is_available(client).available
    assert not SystemStateTarget(loader_factory=_factory({})).is_available(client).available
