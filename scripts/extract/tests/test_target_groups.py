"""groups target tests using an injected stub loader."""

import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

from extract.localization import Localizer
from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.groups import GroupsTarget
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
    (resfiles / "cd").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/groups.fsdbinary,cd/y.bin,def,0,20\n",
        encoding="utf-8",
    )
    (resfiles / "cd" / "y.bin").write_bytes(b"\x00" * 10)
    return ClientRoot(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        root=tmp_path / "client",
        stillness_dir=stillness,
        resfiles_dir=resfiles,
        bin_dir=bin_dir,
        platform="darwin",
    )


class _FakeGroupRecord:
    def __init__(self, **kwargs: Any):
        self._fields = dict(kwargs)

    def __dir__(self) -> List[str]:
        return list(self._fields.keys())

    def __getattr__(self, name: str) -> Any:
        if name in self._fields:
            return self._fields[name]
        raise AttributeError(name)


class _FakeLoader:
    def __init__(self, records: Dict[int, _FakeGroupRecord]):
        self._records = records

    def load(self, _path: str) -> Dict[int, _FakeGroupRecord]:
        return self._records


def _factory(records: Dict[int, _FakeGroupRecord]):
    fake = _FakeLoader(records)
    return lambda _client: fake


def test_groups_target_emits_strip_data_compatible_shape(tmp_path: Path):
    records = {
        1: _FakeGroupRecord(groupID=1, categoryID=1, groupNameID=100, anchorable=0, published=0),
        465: _FakeGroupRecord(groupID=465, categoryID=25, groupNameID=200, anchorable=0, published=1),
    }
    localizer = Localizer(mapping={100: "Character", 200: "Mineable Ores"}, language="en-us")

    client = _make_client(tmp_path)
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)

    target = GroupsTarget(
        loader_factory=_factory(records),
        localizer_factory=lambda _c: localizer,
    )
    result = target.extract(client, run_dir)

    assert result.status == "ok"
    assert result.row_count == 2

    data = json.loads((run_dir / "raw" / "groups.json").read_text())
    assert data["1"]["groupID"] == 1
    assert data["1"]["categoryID"] == 1
    assert data["1"]["groupName_en-us"] == "Character"
    assert data["465"]["groupName_en-us"] == "Mineable Ores"


def test_groups_target_handles_missing_localization(tmp_path: Path):
    records = {
        99: _FakeGroupRecord(groupID=99, categoryID=99, groupNameID=77777, published=0),
    }
    localizer = Localizer(mapping={}, language="en-us")

    client = _make_client(tmp_path)
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)

    target = GroupsTarget(
        loader_factory=_factory(records),
        localizer_factory=lambda _c: localizer,
    )
    target.extract(client, run_dir)

    data = json.loads((run_dir / "raw" / "groups.json").read_text())
    assert data["99"]["groupName_en-us"] == ""


def test_groups_target_skips_when_resource_missing(tmp_path: Path):
    client = _make_client(tmp_path)
    (client.stillness_dir / "resfileindex.txt").write_text("", encoding="utf-8")
    target = GroupsTarget(
        loader_factory=_factory({}),
        localizer_factory=lambda _c: Localizer(mapping={}),
    )
    availability = target.is_available(client)
    assert availability.available is False
    assert "groups.fsdbinary" in (availability.reason or "")
