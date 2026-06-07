"""icons target tests with injected stub loader and synthetic types.json."""

import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.icons import IconsTarget
from extract.types import ClientRoot, ValidationSeverity


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
    (resfiles / "aa").mkdir(parents=True)
    (resfiles / "bb").mkdir(parents=True)
    # iconids.fsdbinary plus two icon assets in the index.
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/iconids.fsdbinary,aa/i.bin,h,0,10\n"
        "res:/ui/texture/icons/inventory/icon_11.png,aa/icon11.png,h,0,10\n"
        "res:/ui/texture/icons/inventory/icon_22.png,bb/icon22.png,h,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "aa" / "i.bin").write_bytes(b"\x00")
    (resfiles / "aa" / "icon11.png").write_bytes(b"PNG-11")
    (resfiles / "bb" / "icon22.png").write_bytes(b"PNG-22")
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


class _IconRecord:
    def __init__(self, iconFile: str):
        self.iconFile = iconFile

    def __dir__(self) -> List[str]:
        return ["iconFile"]


class _IconLoader:
    def __init__(self, records: Dict[int, _IconRecord]):
        self._records = records

    def load(self, _path: str) -> Dict[int, _IconRecord]:
        return self._records


def _factory(records: Dict[int, _IconRecord]):
    fake = _IconLoader(records)
    return lambda _c: fake


def _seed_types_json(run_dir: Path, types_data: Dict[str, Dict[str, Any]]) -> None:
    raw = run_dir / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    (raw / "types.json").write_text(json.dumps(types_data), encoding="utf-8")


def test_icons_target_copies_icons_referenced_by_types(tmp_path: Path):
    client = _client(tmp_path)
    run_dir = tmp_path / "run"
    _seed_types_json(run_dir, {
        "11": {"typeID": 11, "iconID": 100},
        "22": {"typeID": 22, "iconID": 200},
        "33": {"typeID": 33, "iconID": 999},  # iconID not in loader -> silently skipped
        "44": {"typeID": 44},  # no iconID -> skipped
    })

    target = IconsTarget(
        loader_factory=_factory({
            100: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_11.png"),
            200: _IconRecord(iconFile="res:/UI/Texture/Icons/Inventory/icon_22.png"),  # mixed case
        }),
        cache_dir=None,
    )
    result = target.extract(client, run_dir)

    assert result.status == "ok"
    icons_dir = run_dir / "raw" / "icons"
    assert (icons_dir / "11.png").read_bytes() == b"PNG-11"
    assert (icons_dir / "22.png").read_bytes() == b"PNG-22"  # case-insensitive lookup
    assert not (icons_dir / "33.png").exists()
    assert not (icons_dir / "44.png").exists()


def test_icons_target_skips_when_types_not_extracted(tmp_path: Path):
    client = _client(tmp_path)
    run_dir = tmp_path / "run"
    target = IconsTarget(loader_factory=_factory({}), cache_dir=None)
    result = target.extract(client, run_dir)
    assert result.status == "skipped"


def test_icons_target_unavailable_when_iconids_missing(tmp_path: Path):
    client = _client(tmp_path)
    (client.stillness_dir / "resfileindex.txt").write_text("", encoding="utf-8")
    target = IconsTarget(loader_factory=_factory({}), cache_dir=None)
    availability = target.is_available(client)
    assert not availability.available


def _client_with_uncached_icon(tmp_path: Path) -> ClientRoot:
    """Like _client but icon_22.png hash file doesn't exist on disk."""
    stillness = tmp_path / "c" / "stillness"
    bin_dir = stillness / "bin64"
    resfiles = tmp_path / "rf"
    bin_dir.mkdir(parents=True)
    (resfiles / "aa").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/iconids.fsdbinary,aa/i.bin,h,0,10\n"
        "res:/ui/texture/icons/inventory/icon_11.png,aa/icon11.png,h,0,10\n"
        "res:/ui/texture/icons/inventory/icon_22.png,bb/icon22.png,h,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "aa" / "i.bin").write_bytes(b"\x00")
    (resfiles / "aa" / "icon11.png").write_bytes(b"PNG-11")
    # NOTE: bb/icon22.png intentionally missing.
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


def test_icons_target_cdn_fallback_fetches_missing_icons(tmp_path: Path):
    """When a hash file is absent locally, CDN fetcher fills it."""
    client = _client_with_uncached_icon(tmp_path)
    run_dir = tmp_path / "run"
    _seed_types_json(run_dir, {
        "11": {"typeID": 11, "iconID": 100},
        "22": {"typeID": 22, "iconID": 200},
    })

    fetched: List[str] = []

    def fake_cdn(hash_path: str) -> bytes:
        fetched.append(hash_path)
        return b"CDN-PNG-22"

    target = IconsTarget(
        loader_factory=_factory({
            100: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_11.png"),
            200: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_22.png"),
        }),
        cdn_fetcher=fake_cdn,
        cdn_parallel=1,
        cache_dir=None,
    )
    result = target.extract(client, run_dir)

    assert result.status == "ok"
    assert result.row_count == 2
    icons_dir = run_dir / "raw" / "icons"
    assert (icons_dir / "11.png").read_bytes() == b"PNG-11"  # local copy
    assert (icons_dir / "22.png").read_bytes() == b"CDN-PNG-22"  # CDN fallback
    assert fetched == ["bb/icon22.png"]


def test_icons_target_cdn_failure_is_silent(tmp_path: Path):
    """A failing CDN fetch does NOT crash the target; the icon is just skipped."""
    import urllib.error

    client = _client_with_uncached_icon(tmp_path)
    run_dir = tmp_path / "run"
    _seed_types_json(run_dir, {
        "11": {"typeID": 11, "iconID": 100},
        "22": {"typeID": 22, "iconID": 200},
    })

    def fake_cdn(_hash_path: str) -> bytes:
        raise urllib.error.URLError("offline")

    target = IconsTarget(
        loader_factory=_factory({
            100: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_11.png"),
            200: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_22.png"),
        }),
        cdn_fetcher=fake_cdn,
        cdn_parallel=1,
        cache_dir=None,
    )
    result = target.extract(client, run_dir)
    assert result.status == "ok"
    assert result.row_count == 1  # only local copy succeeded
    icons_dir = run_dir / "raw" / "icons"
    assert (icons_dir / "11.png").exists()
    assert not (icons_dir / "22.png").exists()


def test_icons_target_cdn_disabled_skips_missing_files(tmp_path: Path):
    """With cdn_enabled=False, missing local files don't trigger network calls."""
    client = _client_with_uncached_icon(tmp_path)
    run_dir = tmp_path / "run"
    _seed_types_json(run_dir, {
        "11": {"typeID": 11, "iconID": 100},
        "22": {"typeID": 22, "iconID": 200},
    })

    def boom(_hash_path: str) -> bytes:
        raise AssertionError("CDN must not be called when cdn_enabled=False")

    target = IconsTarget(
        loader_factory=_factory({
            100: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_11.png"),
            200: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_22.png"),
        }),
        cdn_fetcher=boom,
        cdn_enabled=False,
        cache_dir=None,
    )
    result = target.extract(client, run_dir)
    assert result.status == "ok"
    assert result.row_count == 1


def test_icons_target_cache_hit_skips_cdn(tmp_path: Path):
    """When the cache already holds the hash, we copy from cache, not CDN."""
    client = _client_with_uncached_icon(tmp_path)
    run_dir = tmp_path / "run"
    cache_dir = tmp_path / "cdn-cache"
    (cache_dir / "bb").mkdir(parents=True)
    (cache_dir / "bb" / "icon22.png").write_bytes(b"CACHED-22")
    _seed_types_json(run_dir, {
        "22": {"typeID": 22, "iconID": 200},
    })

    def boom(_hash_path: str) -> bytes:
        raise AssertionError("CDN must not be called on cache hit")

    target = IconsTarget(
        loader_factory=_factory({
            200: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_22.png"),
        }),
        cdn_fetcher=boom,
        cache_dir=cache_dir,
    )
    result = target.extract(client, run_dir)
    assert result.status == "ok"
    assert result.row_count == 1
    assert (run_dir / "raw" / "icons" / "22.png").read_bytes() == b"CACHED-22"


def test_icons_target_cdn_fetch_populates_cache(tmp_path: Path):
    """Successful CDN fetch writes through to the hash cache."""
    client = _client_with_uncached_icon(tmp_path)
    run_dir = tmp_path / "run"
    cache_dir = tmp_path / "cdn-cache"
    _seed_types_json(run_dir, {
        "22": {"typeID": 22, "iconID": 200},
    })

    fetched: List[str] = []

    def fake_cdn(hash_path: str) -> bytes:
        fetched.append(hash_path)
        return b"NEWLY-FETCHED"

    target = IconsTarget(
        loader_factory=_factory({
            200: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_22.png"),
        }),
        cdn_fetcher=fake_cdn,
        cdn_parallel=1,
        cache_dir=cache_dir,
    )
    result = target.extract(client, run_dir)
    assert result.status == "ok"
    assert fetched == ["bb/icon22.png"]
    assert (cache_dir / "bb" / "icon22.png").read_bytes() == b"NEWLY-FETCHED"


class _IconInfo:
    def __init__(self, folder: str):
        self.folder = folder

    def __dir__(self) -> List[str]:
        return ["folder"]


class _GraphicRecord:
    def __init__(self, iconInfo: "_IconInfo | None"):
        self.iconInfo = iconInfo

    def __dir__(self) -> List[str]:
        return ["iconInfo"]


def _graphics_factory(records: Dict[int, _GraphicRecord]):
    fake = _IconLoader(records)  # same .load() contract
    return lambda _c: fake


def _client_with_graphics(tmp_path: Path) -> ClientRoot:
    """Client with both iconids.fsdbinary and graphicids.fsdbinary registered."""
    stillness = tmp_path / "c" / "stillness"
    bin_dir = stillness / "bin64"
    resfiles = tmp_path / "rf"
    bin_dir.mkdir(parents=True)
    (resfiles / "aa").mkdir(parents=True)
    (resfiles / "bb").mkdir(parents=True)
    (resfiles / "cc").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/iconids.fsdbinary,aa/i.bin,h,0,10\n"
        "res:/staticdata/graphicids.fsdbinary,aa/g.bin,h,0,10\n"
        "res:/ui/texture/icons/inventory/icon_11.png,aa/icon11.png,h,0,10\n"
        # graphicID 700 folder, 64px asset.
        "res:/dx9/model/spaceobjectfactory/icons/trad_corv_02/700_64.png,bb/g700_64.png,h,0,10\n"
        # graphicID 800 folder, 64px asset (mixed case to exercise lookup).
        "res:/dx9/model/spaceobjectfactory/icons/dep_assembly/800_64.png,cc/g800_64.png,h,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "aa" / "i.bin").write_bytes(b"\x00")
    (resfiles / "aa" / "g.bin").write_bytes(b"\x00")
    (resfiles / "aa" / "icon11.png").write_bytes(b"PNG-11")
    (resfiles / "bb" / "g700_64.png").write_bytes(b"PNG-G700")
    (resfiles / "cc" / "g800_64.png").write_bytes(b"PNG-G800")
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


def test_icons_target_extracts_graphic_id_fallback(tmp_path: Path):
    """Types with only graphicID resolve via graphicIDsLoader.iconInfo.folder."""
    client = _client_with_graphics(tmp_path)
    run_dir = tmp_path / "run"
    _seed_types_json(run_dir, {
        "11": {"typeID": 11, "iconID": 100},                  # iconID path
        "70": {"typeID": 70, "graphicID": 700},                # graphicID path
        # Trailing slash on folder must not break path join.
        "80": {"typeID": 80, "graphicID": 800},                # graphicID path
        "90": {"typeID": 90, "graphicID": 999},                # graphicID not in graphics loader
        "99": {"typeID": 99},                                  # neither id
    })

    target = IconsTarget(
        loader_factory=_factory({
            100: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_11.png"),
        }),
        graphics_loader_factory=_graphics_factory({
            700: _GraphicRecord(iconInfo=_IconInfo(folder="res:/dx9/model/SpaceObjectFactory/icons/trad_corv_02")),
            800: _GraphicRecord(iconInfo=_IconInfo(folder="res:/dx9/model/spaceobjectfactory/icons/dep_assembly/")),
        }),
        cache_dir=None,
    )
    result = target.extract(client, run_dir)

    assert result.status == "ok"
    icons_dir = run_dir / "raw" / "icons"
    assert (icons_dir / "11.png").read_bytes() == b"PNG-11"
    assert (icons_dir / "70.png").read_bytes() == b"PNG-G700"
    assert (icons_dir / "80.png").read_bytes() == b"PNG-G800"
    assert not (icons_dir / "90.png").exists()
    assert not (icons_dir / "99.png").exists()


def test_icons_target_iconid_wins_over_graphicid(tmp_path: Path):
    """When both ids are present, iconID is preferred (no regression for the 1k+ types that have both)."""
    client = _client_with_graphics(tmp_path)
    run_dir = tmp_path / "run"
    _seed_types_json(run_dir, {
        "11": {"typeID": 11, "iconID": 100, "graphicID": 700},
    })

    sentinel = {"called": False}

    class _Trap(_IconLoader):
        def load(self, _path):
            sentinel["called"] = True
            return {}

    target = IconsTarget(
        loader_factory=_factory({
            100: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_11.png"),
        }),
        graphics_loader_factory=lambda _c: _Trap({}),
        cache_dir=None,
    )
    result = target.extract(client, run_dir)
    assert result.status == "ok"
    assert (run_dir / "raw" / "icons" / "11.png").read_bytes() == b"PNG-11"
    # graphics loader must not even be invoked when iconID resolved cleanly.
    assert sentinel["called"] is False


def test_icons_target_graphic_record_without_icon_info_is_skipped(tmp_path: Path):
    """If a graphicID record has no iconInfo, it's skipped silently rather than crashing."""
    client = _client_with_graphics(tmp_path)
    run_dir = tmp_path / "run"
    _seed_types_json(run_dir, {
        "70": {"typeID": 70, "graphicID": 700},
    })

    target = IconsTarget(
        loader_factory=_factory({}),
        graphics_loader_factory=_graphics_factory({
            700: _GraphicRecord(iconInfo=None),
        }),
        cache_dir=None,
    )
    result = target.extract(client, run_dir)
    assert result.status == "ok"
    assert not (run_dir / "raw" / "icons" / "70.png").exists()


def test_icons_target_validate_warns_when_types_miss_icons(tmp_path: Path):
    """validate() should flag when types with iconID/graphicID have no <typeID>.png."""
    client = _client_with_graphics(tmp_path)
    run_dir = tmp_path / "run"
    icons_dir = run_dir / "raw" / "icons"
    icons_dir.mkdir(parents=True)
    (icons_dir / "11.png").write_bytes(b"X")  # exists
    _seed_types_json(run_dir, {
        "11": {"typeID": 11, "iconID": 100},
        "22": {"typeID": 22, "iconID": 200},   # icon expected, not on disk
        "70": {"typeID": 70, "graphicID": 700},  # icon expected, not on disk
        "99": {"typeID": 99},                  # no ids → no expectation
    })

    target = IconsTarget()
    issues = target.validate(client, run_dir)
    assert len(issues) == 1
    assert "2/3" in issues[0].message  # 2 missing of 3 expected
    assert issues[0].severity == ValidationSeverity.WARNING


def test_icons_target_local_copy_seeds_cache(tmp_path: Path):
    """When the client has the file locally, we cache it too for next run."""
    client = _client(tmp_path)  # has both icon_11 and icon_22 cached locally
    run_dir = tmp_path / "run"
    cache_dir = tmp_path / "cdn-cache"
    _seed_types_json(run_dir, {
        "11": {"typeID": 11, "iconID": 100},
    })

    target = IconsTarget(
        loader_factory=_factory({
            100: _IconRecord(iconFile="res:/ui/texture/icons/inventory/icon_11.png"),
        }),
        cache_dir=cache_dir,
    )
    result = target.extract(client, run_dir)
    assert result.status == "ok"
    assert (cache_dir / "aa" / "icon11.png").read_bytes() == b"PNG-11"
