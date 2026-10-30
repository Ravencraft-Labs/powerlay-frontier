"""discover CLI tests (filesystem-mocked)."""

import json
from pathlib import Path

import pytest

from extract.discover import build_discovery_report
from extract.types import ClientRoot


def _make_client(tmp_path: Path) -> ClientRoot:
    root = tmp_path / "client"
    stillness = root / "stillness"
    bin_dir = stillness / "bin64"
    resfiles = tmp_path / "resfiles"
    bin_dir.mkdir(parents=True)
    resfiles.mkdir()
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/types.fsdbinary,ab/x.bin,abc,0,10\n"
        "res:/staticdata/groups.fsdbinary,cd/y.bin,def,0,20\n",
        encoding="utf-8",
    )
    (bin_dir / "typesLoader.pyd").write_bytes(b"")
    return ClientRoot(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        root=root,
        stillness_dir=stillness,
        resfiles_dir=resfiles,
        bin_dir=bin_dir,
        platform="darwin",
    )


def test_build_discovery_report_inventories_resources(tmp_path: Path):
    client = _make_client(tmp_path)
    report = build_discovery_report(client)
    assert report["clientRoot"]["build"] == "stillness"
    assert report["platform"] == "darwin"
    assert report["indexEntries"] == 2
    assert "res:/staticdata/types.fsdbinary" in report["candidates"]
    assert "typesLoader.pyd" in report["loaders"]


def test_build_discovery_report_handles_missing_bin_dir(tmp_path: Path):
    client = _make_client(tmp_path)
    object.__setattr__(client, "bin_dir", None)
    report = build_discovery_report(client)
    assert report["loaders"] == {}
