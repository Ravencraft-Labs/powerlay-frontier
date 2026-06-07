"""Localization loading tests."""

import pickle
from pathlib import Path

from extract.localization import Localizer, load_localization
from extract.types import ClientRoot


def _make_client(tmp_path: Path) -> ClientRoot:
    stillness = tmp_path / "client" / "stillness"
    bin_dir = stillness / "bin64"
    resfiles = tmp_path / "rf"
    bin_dir.mkdir(parents=True)
    (resfiles / "ab").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/localizationfsd/localization_fsd_en-us.pickle,ab/loc.bin,h,0,10\n",
        encoding="utf-8",
    )
    payload = (
        "en-us",
        {
            12345: ("Heavy Beam Laser I", None, None),
            67890: ("Mineable Ores", None, None),
            99999: ("Templated {[item]thing.name}", None, {}),
        },
    )
    (resfiles / "ab" / "loc.bin").write_bytes(pickle.dumps(payload))
    return ClientRoot(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        root=tmp_path / "client",
        stillness_dir=stillness,
        resfiles_dir=resfiles,
        bin_dir=bin_dir,
        platform="darwin",
    )


def test_load_localization_returns_id_to_text_map(tmp_path: Path):
    client = _make_client(tmp_path)
    mapping = load_localization(client, "en-us")
    assert mapping[12345] == "Heavy Beam Laser I"
    assert mapping[67890] == "Mineable Ores"
    assert mapping[99999] == "Templated {[item]thing.name}"


def test_load_localization_returns_empty_when_missing(tmp_path: Path):
    stillness = tmp_path / "client" / "stillness"
    stillness.mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text("", encoding="utf-8")
    resfiles = tmp_path / "rf"
    resfiles.mkdir()
    client = ClientRoot(
        build="stillness",
        server="x",
        root=tmp_path / "client",
        stillness_dir=stillness,
        resfiles_dir=resfiles,
        bin_dir=None,
        platform="darwin",
    )
    assert load_localization(client, "en-us") == {}


def test_localizer_get_returns_text_or_empty():
    loc = Localizer(mapping={1: "alpha", 2: "beta"}, language="en-us")
    assert loc.get(1) == "alpha"
    assert loc.get(2) == "beta"
    assert loc.get(99) == ""
    assert loc.get(None) == ""
    assert len(loc) == 2
