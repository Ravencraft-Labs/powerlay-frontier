"""Client root resolution tests (filesystem-mocked)."""

from pathlib import Path

import pytest

from extract.paths import ClientNotFound, candidate_roots, resolve_client_root


def _make_mac_install(base: Path, build: str) -> Path:
    """Create a fake macOS install tree, return the build's `root` path."""
    root = (
        base
        / "Library"
        / "Application Support"
        / "EVE Frontier"
        / "SharedCache"
        / build
        / "eve.app"
        / "Contents"
        / "Resources"
        / "build"
    )
    root.mkdir(parents=True)
    (root / "resfileindex.txt").write_text("", encoding="utf-8")
    (root / "bin64").mkdir()
    resfiles = (
        base
        / "Library"
        / "Application Support"
        / "Frontier"
        / "SharedCache"
        / "ResFiles"
    )
    resfiles.mkdir(parents=True)
    return root


def _make_windows_install(base: Path, build: str) -> Path:
    """Create a fake Windows install tree (stillness/ subdir layout)."""
    root = base / "CCP" / "EVE Frontier" / build
    (root / "stillness").mkdir(parents=True)
    (root / "stillness" / "resfileindex.txt").write_text("", encoding="utf-8")
    (root / "stillness" / "bin64").mkdir()
    (root / "ResFiles").mkdir()
    return root


def test_candidate_roots_returns_platform_entries():
    entries = candidate_roots(home=Path("/Users/test"), platform="darwin", build="stillness")
    assert any("EVE Frontier/SharedCache/stillness" in str(p) for p in entries)


def test_resolve_finds_macos_install(tmp_path: Path):
    root = _make_mac_install(tmp_path, "stillness")
    client = resolve_client_root(
        build="stillness",
        override=None,
        home=tmp_path,
        platform="darwin",
    )
    assert client.root == root
    # On macOS the build dir is the stillness equivalent — no separate stillness/ subdir.
    assert client.stillness_dir == root
    assert client.resfiles_dir.exists()
    assert client.platform == "darwin"
    assert client.server == "stillness.servers.evefrontier.com"


def test_resolve_uses_override(tmp_path: Path):
    root = _make_mac_install(tmp_path, "utopia")
    client = resolve_client_root(
        build="utopia",
        override=root,
        home=Path("/nonexistent"),
        platform="darwin",
    )
    assert client.root == root


def test_resolve_finds_windows_install_with_stillness_subdir(tmp_path: Path):
    root = _make_windows_install(tmp_path, "stillness")
    client = resolve_client_root(
        build="stillness", override=root, home=tmp_path, platform="win32",
    )
    assert client.root == root
    assert client.stillness_dir == root / "stillness"
    assert client.bin_dir == root / "stillness" / "bin64"


def test_resolve_raises_when_nothing_found(tmp_path: Path):
    with pytest.raises(ClientNotFound) as exc:
        resolve_client_root(
            build="stillness",
            override=None,
            home=tmp_path,
            platform="darwin",
        )
    assert "stillness" in str(exc.value)
    assert "--client-path" in str(exc.value)


def test_bin_dir_is_none_if_missing(tmp_path: Path):
    root = _make_mac_install(tmp_path, "stillness")
    (root / "bin64").rmdir()
    client = resolve_client_root(
        build="stillness", override=None, home=tmp_path, platform="darwin"
    )
    assert client.bin_dir is None
