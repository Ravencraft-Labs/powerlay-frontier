"""industry_blueprints target tests using an injected stub loader."""

import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.industry_blueprints import IndustryBlueprintsTarget
from extract.types import ClientRoot


@pytest.fixture(autouse=True)
def _reset_registry():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _make_client(tmp_path: Path) -> ClientRoot:
    stillness = tmp_path / "client" / "stillness"
    bin_dir = stillness / "bin64"
    resfiles = tmp_path / "resfiles"
    bin_dir.mkdir(parents=True)
    (resfiles / "11").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/industry_blueprints.fsdbinary,11/b.bin,h,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "11" / "b.bin").write_bytes(b"\x00" * 10)
    return ClientRoot(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        root=tmp_path / "client",
        stillness_dir=stillness,
        resfiles_dir=resfiles,
        bin_dir=bin_dir,
        platform="darwin",
    )


class _FakeRecord:
    def __init__(self, **kwargs: Any):
        self._fields = dict(kwargs)

    def __dir__(self) -> List[str]:
        return list(self._fields.keys())

    def __getattr__(self, name: str) -> Any:
        if name in self._fields:
            return self._fields[name]
        raise AttributeError(name)


class _FakeLoader:
    def __init__(self, records: Dict[int, Any]):
        self._records = records

    def load(self, _path: str) -> Dict[int, Any]:
        return self._records


def _factory(records: Dict[int, Any]):
    fake = _FakeLoader(records)
    return lambda _client: fake


def test_blueprints_target_emits_inputs_outputs_shape(tmp_path: Path):
    records = {
        1000: _FakeRecord(
            primaryTypeID=88561,
            runTime=4,
            inputs=[
                _FakeRecord(typeID=89258, quantity=140),
                _FakeRecord(typeID=89259, quantity=90),
            ],
            outputs=[_FakeRecord(typeID=88561, quantity=14)],
        ),
    }

    client = _make_client(tmp_path)
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)

    target = IndustryBlueprintsTarget(loader_factory=_factory(records))
    result = target.extract(client, run_dir)

    assert result.status == "ok"
    assert result.row_count == 1

    data = json.loads((run_dir / "raw" / "industry_blueprints.json").read_text())
    assert data["1000"]["primaryTypeID"] == 88561
    assert data["1000"]["runTime"] == 4
    assert data["1000"]["inputs"][0] == {"typeID": 89258, "quantity": 140}
    assert data["1000"]["outputs"][0]["quantity"] == 14


def test_blueprints_target_skips_when_resource_missing(tmp_path: Path):
    client = _make_client(tmp_path)
    (client.stillness_dir / "resfileindex.txt").write_text("", encoding="utf-8")
    target = IndustryBlueprintsTarget(loader_factory=_factory({}))
    availability = target.is_available(client)
    assert availability.available is False
    assert "industry_blueprints.fsdbinary" in (availability.reason or "")
