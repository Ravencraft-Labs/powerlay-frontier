"""Loader registry tests.

Real CCP loader `.so` files can't be imported in unit tests (they require
the actual client runtime). These tests cover the file-presence detection,
caching, and None-fallback behavior.
"""

from pathlib import Path

import pytest

from extract.loader import LoaderRegistry, ensure_dyld_env_or_reexec


def test_loader_returns_none_when_bin_dir_is_none():
    registry = LoaderRegistry(bin_dir=None)
    assert registry.get("anything") is None


def test_loader_returns_none_when_bin_dir_missing(tmp_path: Path):
    registry = LoaderRegistry(bin_dir=tmp_path / "missing")
    assert registry.get("anything") is None


def test_loader_returns_none_when_loader_file_absent(tmp_path: Path):
    bin_dir = tmp_path / "bin64"
    bin_dir.mkdir()
    registry = LoaderRegistry(bin_dir=bin_dir)
    assert registry.get("typesLoader") is None


def test_loader_caches_none_results(tmp_path: Path):
    bin_dir = tmp_path / "bin64"
    bin_dir.mkdir()
    registry = LoaderRegistry(bin_dir=bin_dir)
    first = registry.get("typesLoader")
    second = registry.get("typesLoader")
    assert first is None
    assert second is None
    # Cache is populated even on miss; subsequent calls return same sentinel.
    assert "typesLoader" in registry._cache  # type: ignore[attr-defined]


def test_loader_finds_file_then_attempts_import_and_caches_failure(tmp_path: Path):
    """When source .so exists but is bogus, import fails and is cached as None."""
    bin_dir = tmp_path / "bin64"
    bin_dir.mkdir()
    # An empty .so file will fail to import; we just verify get() handles the
    # failure path without raising and caches the None result.
    (bin_dir / "fakeLoader.so").write_bytes(b"")
    registry = LoaderRegistry(bin_dir=bin_dir)
    result = registry.get("fakeLoader")
    assert result is None


def test_ensure_dyld_env_or_reexec_is_noop_when_already_set(monkeypatch):
    """When DYLD_LIBRARY_PATH already contains the libpython dir, function returns."""
    import sys as _sys
    if _sys.platform != "darwin":
        pytest.skip("DYLD logic is macOS-specific")
    import sysconfig
    libdir = sysconfig.get_config_var("LIBDIR")
    monkeypatch.setenv("DYLD_LIBRARY_PATH", libdir)
    # Should return without calling execv (would terminate the test process).
    ensure_dyld_env_or_reexec()
