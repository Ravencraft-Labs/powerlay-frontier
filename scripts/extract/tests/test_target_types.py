"""types target tests using an injected stub loader."""

import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

from extract.localization import Localizer
from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.types import TypesTarget
from extract.types import ClientRoot


@pytest.fixture(autouse=True)
def _reset_registry():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _make_client_with_types(tmp_path: Path) -> ClientRoot:
    stillness = tmp_path / "client" / "stillness"
    bin_dir = stillness / "bin64"
    resfiles = tmp_path / "resfiles"
    bin_dir.mkdir(parents=True)
    (resfiles / "ab").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/types.fsdbinary,ab/x.bin,abc,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "ab" / "x.bin").write_bytes(b"\x00" * 10)
    return ClientRoot(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        root=tmp_path / "client",
        stillness_dir=stillness,
        resfiles_dir=resfiles,
        bin_dir=bin_dir,
        platform="darwin",
    )


class _FakeTypeRecord:
    """Simulates a CCP cfsd record: attribute access, variable fields."""

    def __init__(self, **kwargs: Any):
        self._fields = dict(kwargs)

    def __dir__(self) -> List[str]:
        return list(self._fields.keys())

    def __getattr__(self, name: str) -> Any:
        if name in self._fields:
            return self._fields[name]
        raise AttributeError(name)


class _FakeLoader:
    """Mimics CCP typesLoader: load(path) returns dict-like with int keys."""

    def __init__(self, records: Dict[int, _FakeTypeRecord]):
        self._records = records

    def load(self, _path: str) -> Dict[int, _FakeTypeRecord]:
        return self._records


def _make_loader_factory(records: Dict[int, _FakeTypeRecord]):
    fake = _FakeLoader(records)

    def factory(_client: ClientRoot):
        return fake

    return factory


def test_types_target_emits_strip_data_compatible_shape(tmp_path: Path):
    records = {
        459: _FakeTypeRecord(
            typeID=459,
            typeNameID=12345,
            groupID=53,
            mass=1000.0,
            volume=25.0,
            capacity=1.0,
            basePrice=0.0,
            radius=1.0,
            portionSize=1,
            published=0,
            graphicID=11108,
            iconID=355,
            descriptionID=94509,
        ),
    }
    localizer = Localizer(mapping={12345: "Heavy Beam Laser I"}, language="en-us")

    client = _make_client_with_types(tmp_path)
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)

    target = TypesTarget(
        loader_factory=_make_loader_factory(records),
        localizer_factory=lambda _c: localizer,
    )
    result = target.extract(client, run_dir)

    assert result.status == "ok"
    assert result.row_count == 1

    data = json.loads((run_dir / "raw" / "types.json").read_text())
    assert "459" in data
    entry = data["459"]
    assert entry["typeID"] == 459
    assert entry["typeNameID"] == 12345
    assert entry["typeName_en-us"] == "Heavy Beam Laser I"
    assert entry["groupID"] == 53
    assert entry["mass"] == 1000.0


def test_types_target_emits_unknown_name_for_missing_localization(tmp_path: Path):
    records = {
        100: _FakeTypeRecord(typeID=100, typeNameID=77777, groupID=1),
    }
    localizer = Localizer(mapping={}, language="en-us")

    client = _make_client_with_types(tmp_path)
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)

    target = TypesTarget(
        loader_factory=_make_loader_factory(records),
        localizer_factory=lambda _c: localizer,
    )
    result = target.extract(client, run_dir)

    assert result.status == "ok"
    data = json.loads((run_dir / "raw" / "types.json").read_text())
    assert data["100"]["typeName_en-us"] == ""


def test_types_target_skips_when_resource_missing(tmp_path: Path):
    client = _make_client_with_types(tmp_path)
    (client.stillness_dir / "resfileindex.txt").write_text("", encoding="utf-8")
    target = TypesTarget(
        loader_factory=_make_loader_factory({}),
        localizer_factory=lambda _c: Localizer(mapping={}),
    )
    availability = target.is_available(client)
    assert availability.available is False
    assert "types.fsdbinary" in (availability.reason or "")
