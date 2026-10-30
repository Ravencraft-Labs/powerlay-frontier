"""resfileindex.txt parser tests."""

from pathlib import Path

import pytest

from extract.resindex import ResIndex, parse_resindex


def test_parse_sample_index_has_expected_logical_paths(fixtures_dir: Path):
    index = parse_resindex(fixtures_dir / "resfileindex_sample.txt")
    assert "res:/staticdata/types.fsdbinary" in index
    assert "res:/staticdata/groups.fsdbinary" in index
    assert "res:/localizationfsd/localization_fsd_en-us.pickle" in index


def test_index_entry_fields(fixtures_dir: Path):
    index = parse_resindex(fixtures_dir / "resfileindex_sample.txt")
    types_entry = index["res:/staticdata/types.fsdbinary"]
    assert types_entry.hash_path == "ab/ab1234deadbeef.fsdbinary"
    assert types_entry.file_hash == "ab1234deadbeef"
    assert types_entry.size == 123456


def test_resolve_returns_physical_path(fixtures_dir: Path, tmp_path: Path):
    resfiles_root = tmp_path / "ResFiles"
    (resfiles_root / "ab").mkdir(parents=True)
    (resfiles_root / "ab" / "ab1234deadbeef.fsdbinary").write_bytes(b"x")

    index = parse_resindex(fixtures_dir / "resfileindex_sample.txt")
    physical = index.resolve("res:/staticdata/types.fsdbinary", resfiles_root)
    assert physical == resfiles_root / "ab" / "ab1234deadbeef.fsdbinary"
    assert physical.exists()


def test_resolve_missing_logical_path_raises(fixtures_dir: Path, tmp_path: Path):
    index = parse_resindex(fixtures_dir / "resfileindex_sample.txt")
    with pytest.raises(KeyError):
        index.resolve("res:/staticdata/nope.fsdbinary", tmp_path)


def test_parse_handles_blank_lines_and_trailing_newline(tmp_path: Path):
    path = tmp_path / "idx.txt"
    path.write_text(
        "\n"
        "res:/a,h1/a.bin,a,0,10\n"
        "\n"
        "res:/b,h2/b.bin,b,0,20\n"
        "\n",
        encoding="utf-8",
    )
    index = parse_resindex(path)
    assert set(index) == {"res:/a", "res:/b"}
