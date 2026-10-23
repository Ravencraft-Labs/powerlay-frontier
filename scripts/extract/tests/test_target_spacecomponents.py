"""spacecomponentsbytype target tests."""

import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.spacecomponents import SpaceComponentsTarget
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
    (resfiles / "44").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/spacecomponentsbytype.fsdbinary,44/s.bin,h,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "44" / "s.bin").write_bytes(b"\x00" * 10)
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


class _Rec:
    def __init__(self, **kw: Any):
        self._f = dict(kw)
    def __dir__(self) -> List[str]:
        return list(self._f.keys())
    def __getattr__(self, n: str) -> Any:
        if n in self._f:
            return self._f[n]
        raise AttributeError(n)


class _Loader:
    def __init__(self, recs: Dict[int, Any]):
        self._recs = recs
    def load(self, _p: str) -> Dict[int, Any]:
        return self._recs


def _factory(recs: Dict[int, Any]):
    fake = _Loader(recs)
    return lambda _c: fake


def test_spacecomponents_emit_records_with_assembly_construction(tmp_path: Path):
    records = {
        77777: _Rec(
            assemblyConstruction=_Rec(
                constructedItem=88561,
                inputItems={"89258": 140, "89259": 90},
            ),
        ),
        12345: _Rec(storeSlimItemFieldInItemSettings=1),
    }
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)
    target = SpaceComponentsTarget(loader_factory=_factory(records))
    result = target.extract(_client(tmp_path), run_dir)
    assert result.status == "ok"
    assert result.row_count == 2

    data = json.loads((run_dir / "raw" / "spacecomponentsbytype.json").read_text())
    ac = data["77777"]["assemblyConstruction"]
    assert ac["constructedItem"] == 88561
    assert ac["inputItems"] == {"89258": 140, "89259": 90}
    # Pass-through record without assemblyConstruction is preserved too.
    assert data["12345"]["storeSlimItemFieldInItemSettings"] == 1


def test_spacecomponents_skips_when_resource_missing(tmp_path: Path):
    client = _client(tmp_path)
    (client.stillness_dir / "resfileindex.txt").write_text("", encoding="utf-8")
    target = SpaceComponentsTarget(loader_factory=_factory({}))
    availability = target.is_available(client)
    assert not availability.available
    assert "spacecomponentsbytype.fsdbinary" in (availability.reason or "")
