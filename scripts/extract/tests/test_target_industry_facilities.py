"""industry_facilities target tests."""

import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.industry_facilities import IndustryFacilitiesTarget
from extract.types import ClientRoot


@pytest.fixture(autouse=True)
def _reset():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _client(tmp_path: Path) -> ClientRoot:
    stillness = tmp_path / "c" / "stillness"
    bin_dir = stillness / "bin64"
    resfiles = tmp_path / "rf"
    bin_dir.mkdir(parents=True)
    (resfiles / "22").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/industry_facilities.fsdbinary,22/f.bin,h,0,10\n",
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


def test_facilities_emit_expected_shape(tmp_path: Path):
    records = {
        87654: _Rec(
            blueprints=[_Rec(blueprintID=1026, maxInputRuns=219, maxOutputRuns=334)],
            inputCapacity=1200,
            outputCapacity=1000,
        )
    }
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)
    target = IndustryFacilitiesTarget(loader_factory=_factory(records))
    result = target.extract(_client(tmp_path), run_dir)
    assert result.status == "ok"
    data = json.loads((run_dir / "raw" / "industry_facilities.json").read_text())
    assert data["87654"]["inputCapacity"] == 1200
    assert data["87654"]["outputCapacity"] == 1000
    assert data["87654"]["blueprints"][0]["blueprintID"] == 1026
    assert data["87654"]["blueprints"][0]["maxInputRuns"] == 219


def test_facilities_skips_when_resource_missing(tmp_path: Path):
    client = _client(tmp_path)
    (client.stillness_dir / "resfileindex.txt").write_text("", encoding="utf-8")
    target = IndustryFacilitiesTarget(loader_factory=_factory({}))
    availability = target.is_available(client)
    assert not availability.available
    assert "industry_facilities.fsdbinary" in (availability.reason or "")
