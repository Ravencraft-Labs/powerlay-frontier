"""solarsystems target tests with injected stub loader."""

import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

from extract.localization import Localizer
from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.solarsystems import SolarsystemsTarget
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
    (resfiles / "33").mkdir(parents=True)
    (resfiles / "44").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/systems.static,33/s.bin,h,0,10\n"
        "res:/staticdata/systems.schema,44/s.bin,h,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "33" / "s.bin").write_bytes(b"\x00")
    (resfiles / "44" / "s.bin").write_bytes(b"\x00")
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


class _Vector:
    def __init__(self, coords: List[float]):
        self.data = coords


class _Record:
    def __init__(self, **kw: Any):
        self._f = dict(kw)
    def __dir__(self) -> List[str]:
        return list(self._f.keys())
    def __getattr__(self, n: str) -> Any:
        if n in self._f:
            return self._f[n]
        raise AttributeError(n)


def _make_loader_factory(records: Dict[int, Any]):
    """Returns a callable matching extract.static_loader.load_static_with_schema's signature.

    SolarsystemsTarget calls load_static_with_schema(client, static_path, schema_path).
    """
    def loader(_client, _static, _schema):
        return records
    return loader


def test_solarsystems_emits_array_with_names_and_topology(tmp_path: Path):
    records = {
        30000001: _Record(
            nameID=825732, constellationID=20000001, regionID=10000001,
            center=_Vector([1.0, 2.0, 3.0]),
        ),
        30000002: _Record(
            nameID=825733, constellationID=20000002, regionID=10000002,
            center=_Vector([4.0, 5.0, 6.0]),
        ),
    }
    localizer = Localizer(mapping={825732: "A 2560", 825733: "M 974"})

    client = _client(tmp_path)
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)

    target = SolarsystemsTarget(
        loader_factory=_make_loader_factory(records),
        localizer_factory=lambda _c: localizer,
    )
    result = target.extract(client, run_dir)

    assert result.status == "ok"
    assert result.row_count == 2

    data = json.loads((run_dir / "raw" / "solarsystems.json").read_text())
    assert isinstance(data, list)
    assert data[0]["id"] == 30000001
    assert data[0]["name"] == "A 2560"
    assert data[0]["constellationId"] == 20000001
    assert data[0]["regionId"] == 10000001
    assert data[0]["location"] == [1.0, 2.0, 3.0]
    assert data[1]["name"] == "M 974"


def test_solarsystems_handles_missing_name(tmp_path: Path):
    records = {
        9999: _Record(nameID=77777, constellationID=1, regionID=1, center=_Vector([0, 0, 0])),
    }
    localizer = Localizer(mapping={})

    client = _client(tmp_path)
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)

    target = SolarsystemsTarget(
        loader_factory=_make_loader_factory(records),
        localizer_factory=lambda _c: localizer,
    )
    target.extract(client, run_dir)

    data = json.loads((run_dir / "raw" / "solarsystems.json").read_text())
    assert data[0]["name"] == ""
    assert data[0]["id"] == 9999


def test_solarsystems_skips_when_static_missing(tmp_path: Path):
    client = _client(tmp_path)
    (client.stillness_dir / "resfileindex.txt").write_text("", encoding="utf-8")
    target = SolarsystemsTarget(
        loader_factory=_make_loader_factory({}),
        localizer_factory=lambda _c: Localizer(mapping={}),
    )
    availability = target.is_available(client)
    assert not availability.available
    assert "systems.static" in (availability.reason or "")
