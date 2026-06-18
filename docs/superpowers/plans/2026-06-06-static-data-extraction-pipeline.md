# Static Data Extraction Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python 3.12 pipeline that extracts static data from a locally installed EVE Frontier client into `data/raw/`, gated by validation and promote stages, so `scripts/strip-data.js` can produce stable `data/stripped/` output before each release.

**Architecture:** A self-contained Python package at `scripts/extract/` with a target-module registry. CLIs `discover`, `extract`, `validate`, `promote` and orchestrator `update_static_data` chain together. Each target (types, groups, industry_blueprints, industry_facilities, solarsystems, spacecomponents, icons) is a separate module exporting a contract. Outputs land in a timestamped `data/extracted/<build>-<server>-<ts>/` run-dir; only validated runs are promoted to `data/raw/`. Cross-platform path resolution handles Windows install layout and the macOS `~/Library/Application Support/EVE Frontier/SharedCache/<build>/...` layout.

**Tech Stack:**
- Python 3.12 (CCP loaders require ABI match)
- Stdlib only at runtime (pathlib, argparse, dataclasses, json, sqlite3, pickle, logging)
- pytest for tests (dev-only)
- pnpm scripts in root `package.json` invoke `python3.12 -m extract.<module>`

**Spec:** `docs/superpowers/specs/2026-06-06-static-data-extraction-pipeline-design.md` — read it for the architectural rationale this plan executes.

**Conventions used throughout:**
- Tests sit next to the package under `scripts/extract/tests/`. Pytest discovery is configured via `pyproject.toml`.
- Commit messages follow the existing repo style: `[<area>] <imperative phrase>` (see `git log --oneline`).
- Every task ends with a commit. Tests are written before implementation. Each test is run twice — once to confirm it fails, once to confirm it passes after implementation.

---

## Phase 1 — Foundation

### Task 1: Bootstrap Python package and pnpm wiring

**Files:**
- Create: `scripts/extract/pyproject.toml`
- Create: `scripts/extract/extract/__init__.py`
- Create: `scripts/extract/extract/__main__.py`
- Create: `scripts/extract/tests/__init__.py`
- Create: `scripts/extract/tests/conftest.py`
- Create: `scripts/extract/README.md`
- Modify: `package.json` (root)
- Modify: `.gitignore` (root)

- [ ] **Step 1: Create `scripts/extract/pyproject.toml`**

```toml
[project]
name = "powerlay-extract"
version = "0.1.0"
description = "EVE Frontier static data extractor"
requires-python = ">=3.12,<3.13"
dependencies = []

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["."]
include = ["extract*"]

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
```

- [ ] **Step 2: Create `scripts/extract/extract/__init__.py`**

```python
"""EVE Frontier static data extractor."""

__version__ = "0.1.0"
```

- [ ] **Step 3: Create `scripts/extract/extract/__main__.py`**

```python
"""Allow `python -m extract` to print usage."""

import sys

USAGE = """\
powerlay-extract: EVE Frontier static data extractor

Usage:
  python -m extract.discover --build {stillness,utopia} [--json] [--probe RES_PATH]
  python -m extract.extract  --build {stillness,utopia} [--target NAME | --all]
  python -m extract.validate RUN_DIR
  python -m extract.promote  RUN_DIR
  python -m extract.update_static_data --build {stillness,utopia} [--yes]
"""


def main() -> int:
    sys.stdout.write(USAGE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Create `scripts/extract/tests/__init__.py` (empty)**

```python
```

- [ ] **Step 5: Create `scripts/extract/tests/conftest.py`**

```python
"""Shared pytest fixtures for extract tests."""

from pathlib import Path

import pytest


@pytest.fixture
def fixtures_dir() -> Path:
    return Path(__file__).parent / "fixtures"
```

- [ ] **Step 6: Create `scripts/extract/README.md`**

```markdown
# powerlay-extract

EVE Frontier static data extractor. See `docs/superpowers/specs/2026-06-06-static-data-extraction-pipeline-design.md` for design.

## Install (one-time)

```bash
cd scripts/extract
python3.12 -m venv .venv
.venv/bin/pip install -e .[dev]
```

Add `scripts/extract/.venv/bin/` to PATH for the shell session, or activate with `source .venv/bin/activate`.

## Run

From the repo root:

```bash
pnpm extract:discover --build stillness
pnpm update-static-data --build stillness
```

See `package.json` for the full set of commands.
```

- [ ] **Step 7: Modify root `package.json` — add scripts after `"types-name-id"` line in the `scripts` block**

```json
    "extract:discover": "python3.12 -m extract.discover",
    "extract:run": "python3.12 -m extract.extract",
    "extract:validate": "python3.12 -m extract.validate",
    "extract:promote": "python3.12 -m extract.promote",
    "update-static-data": "python3.12 -m extract.update_static_data",
```

These scripts assume `python3.12` is on PATH with the `extract` package installed (`pip install -e scripts/extract`). The README above documents the venv setup.

- [ ] **Step 8: Modify root `.gitignore` — add a block under the existing `# Raw game data` section**

```
# Python venv for static data extractor
scripts/extract/.venv/
scripts/extract/**/__pycache__/
scripts/extract/*.egg-info/
scripts/extract/.pytest_cache/

# Extracted runs (raw is already ignored via data/)
```

(`data/extracted/` is already covered by the `data/` rule above it; no new line needed for that path.)

- [ ] **Step 9: Set up the venv and verify pytest runs**

```bash
cd scripts/extract
python3.12 -m venv .venv
.venv/bin/pip install -e .[dev]
.venv/bin/pytest -q
```

Expected: `no tests ran in <X>s` (no tests yet — discovery succeeds, exit code 0 or 5).

- [ ] **Step 10: Verify `python3.12 -m extract` prints usage**

```bash
cd scripts/extract
.venv/bin/python -m extract
```

Expected: the USAGE string from `__main__.py`.

- [ ] **Step 11: Commit**

```bash
git add scripts/extract/pyproject.toml \
        scripts/extract/extract/__init__.py \
        scripts/extract/extract/__main__.py \
        scripts/extract/tests/__init__.py \
        scripts/extract/tests/conftest.py \
        scripts/extract/README.md \
        package.json \
        .gitignore
git commit -m "[extract] bootstrap Python package and pnpm scripts"
```

---

### Task 2: Shared dataclasses (`extract/types.py`)

Used by every later module. Pure data types, no I/O.

**Files:**
- Create: `scripts/extract/extract/types.py`
- Create: `scripts/extract/tests/test_types.py`

- [ ] **Step 1: Write the failing test — `scripts/extract/tests/test_types.py`**

```python
"""Shared dataclass smoke tests."""

from pathlib import Path

import pytest

from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    IndexEntry,
    ValidationIssue,
    ValidationSeverity,
)


def test_client_root_is_frozen():
    root = ClientRoot(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        root=Path("/tmp/x"),
        stillness_dir=Path("/tmp/x/stillness"),
        resfiles_dir=Path("/tmp/x/ResFiles"),
        bin_dir=Path("/tmp/x/bin64"),
        platform="darwin",
    )
    with pytest.raises(Exception):
        root.build = "utopia"  # type: ignore[misc]


def test_index_entry_holds_resource_metadata():
    entry = IndexEntry(
        logical_path="res:/staticdata/types.fsdbinary",
        hash_path="ab/abcd1234deadbeef",
        file_hash="abcd1234deadbeef",
        offset=0,
        size=12345,
    )
    assert entry.hash_path.startswith("ab/")


def test_availability_result_distinguishes_states():
    ok = AvailabilityResult.ok()
    missing = AvailabilityResult.missing("types.fsdbinary not in index")
    assert ok.available is True
    assert missing.available is False
    assert "not in index" in (missing.reason or "")


def test_extract_result_carries_counts_and_errors():
    res = ExtractResult(status="ok", output_path=Path("/tmp/x.json"), row_count=42)
    assert res.status == "ok"
    assert res.row_count == 42
    assert res.error is None


def test_validation_issue_levels():
    err = ValidationIssue(severity=ValidationSeverity.ERROR, target="types", message="x")
    warn = ValidationIssue(severity=ValidationSeverity.WARNING, target="groups", message="y")
    assert err.severity == ValidationSeverity.ERROR
    assert warn.severity == ValidationSeverity.WARNING
```

- [ ] **Step 2: Run tests — expect failure (import error)**

```bash
cd scripts/extract && .venv/bin/pytest -q
```

Expected: `ModuleNotFoundError: No module named 'extract.types'` or similar collection error.

- [ ] **Step 3: Implement `scripts/extract/extract/types.py`**

```python
"""Shared dataclasses for the extractor package."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Literal, Optional


@dataclass(frozen=True)
class ClientRoot:
    """Resolved EVE Frontier client installation."""

    build: Literal["stillness", "utopia"]
    server: str
    root: Path
    stillness_dir: Path
    resfiles_dir: Path
    bin_dir: Optional[Path]
    platform: Literal["darwin", "win32"]


@dataclass(frozen=True)
class IndexEntry:
    """A single row in resfileindex.txt."""

    logical_path: str
    hash_path: str
    file_hash: str
    offset: int
    size: int


@dataclass(frozen=True)
class AvailabilityResult:
    """Whether a target can run against the current client."""

    available: bool
    reason: Optional[str] = None

    @classmethod
    def ok(cls) -> "AvailabilityResult":
        return cls(available=True)

    @classmethod
    def missing(cls, reason: str) -> "AvailabilityResult":
        return cls(available=False, reason=reason)


@dataclass
class ExtractResult:
    """Outcome of one target's extract() call."""

    status: Literal["ok", "skipped", "fail"]
    output_path: Optional[Path] = None
    row_count: int = 0
    source_hash: Optional[str] = None
    source_path: Optional[str] = None
    error: Optional[str] = None


class ValidationSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"


@dataclass(frozen=True)
class ValidationIssue:
    severity: ValidationSeverity
    target: str
    message: str
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest -q
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/types.py scripts/extract/tests/test_types.py
git commit -m "[extract] add shared dataclasses for pipeline contracts"
```

---

### Task 3: Resource index parser (`extract/resindex.py`)

Parses `resfileindex.txt` (the CCP logical-to-hash resource index).

**Files:**
- Create: `scripts/extract/extract/resindex.py`
- Create: `scripts/extract/tests/test_resindex.py`
- Create: `scripts/extract/tests/fixtures/resfileindex_sample.txt`

- [ ] **Step 1: Create the fixture — `scripts/extract/tests/fixtures/resfileindex_sample.txt`**

The handbook describes `resfileindex.txt` as a list of comma-separated rows mapping a logical `res:/...` path to a physical hash file. The exact CCP format is `<logical_path>,<hash_path>,<file_hash>,<offset>,<size>`. Use this synthetic sample for tests:

```
res:/staticdata/types.fsdbinary,ab/ab1234deadbeef.fsdbinary,ab1234deadbeef,0,123456
res:/staticdata/groups.fsdbinary,cd/cd5678cafebabe.fsdbinary,cd5678cafebabe,0,7890
res:/localizationfsd/localization_fsd_en-us.pickle,ef/ef90abcdef0011.pickle,ef90abcdef0011,0,222000
```

(If a real client uses a different delimiter or column order, the parser will be adjusted after the first `discover.py` checkpoint — see Task 9.)

- [ ] **Step 2: Write the failing test — `scripts/extract/tests/test_resindex.py`**

```python
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
```

- [ ] **Step 3: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_resindex.py -q
```

Expected: `ModuleNotFoundError: No module named 'extract.resindex'`.

- [ ] **Step 4: Implement `scripts/extract/extract/resindex.py`**

```python
"""Parser for CCP resfileindex.txt."""

from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterator

from extract.types import IndexEntry


class ResIndex:
    """In-memory view of resfileindex.txt with logical→physical resolution."""

    def __init__(self, entries: Dict[str, IndexEntry]):
        self._entries = entries

    def __contains__(self, logical_path: str) -> bool:
        return logical_path in self._entries

    def __getitem__(self, logical_path: str) -> IndexEntry:
        return self._entries[logical_path]

    def __iter__(self) -> Iterator[str]:
        return iter(self._entries)

    def __len__(self) -> int:
        return len(self._entries)

    def resolve(self, logical_path: str, resfiles_root: Path) -> Path:
        """Return the absolute path to the physical resource file."""
        entry = self._entries[logical_path]
        return resfiles_root / entry.hash_path


def parse_resindex(path: Path) -> ResIndex:
    """Parse resfileindex.txt into an in-memory index.

    Expected line format (comma-separated):
        <logical_path>,<hash_path>,<file_hash>,<offset>,<size>

    Blank lines and missing optional offset/size fields tolerated.
    """
    entries: Dict[str, IndexEntry] = {}
    with path.open("r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line:
                continue
            parts = line.split(",")
            if len(parts) < 3:
                continue
            logical = parts[0]
            hash_path = parts[1]
            file_hash = parts[2]
            offset = int(parts[3]) if len(parts) > 3 and parts[3] else 0
            size = int(parts[4]) if len(parts) > 4 and parts[4] else 0
            entries[logical] = IndexEntry(
                logical_path=logical,
                hash_path=hash_path,
                file_hash=file_hash,
                offset=offset,
                size=size,
            )
    return ResIndex(entries)
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_resindex.py -q
```

Expected: `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add scripts/extract/extract/resindex.py \
        scripts/extract/tests/test_resindex.py \
        scripts/extract/tests/fixtures/resfileindex_sample.txt
git commit -m "[extract] parse resfileindex.txt into logical->physical index"
```

---

### Task 4: Client root resolution (`extract/paths.py`)

Cross-platform discovery of the EVE Frontier install location.

**Files:**
- Create: `scripts/extract/extract/paths.py`
- Create: `scripts/extract/tests/test_paths.py`

- [ ] **Step 1: Write the failing test — `scripts/extract/tests/test_paths.py`**

```python
"""Client root resolution tests (filesystem-mocked)."""

from pathlib import Path

import pytest

from extract.paths import ClientNotFound, candidate_roots, resolve_client_root


def _make_mac_install(base: Path, build: str) -> Path:
    """Create a fake macOS install tree, return the build's `root` path."""
    server = f"{build}.servers.evefrontier.com"
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
        / server
    )
    (root / "stillness").mkdir(parents=True)
    (root / "stillness" / "resfileindex.txt").write_text("", encoding="utf-8")
    (root / "stillness" / "bin64").mkdir()
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
    assert client.stillness_dir == root / "stillness"
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
    (root / "stillness" / "bin64").rmdir()
    client = resolve_client_root(
        build="stillness", override=None, home=tmp_path, platform="darwin"
    )
    assert client.bin_dir is None
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_paths.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/paths.py`**

```python
"""EVE Frontier client root resolution for Windows and macOS."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Iterable, Literal, Optional

from extract.types import ClientRoot

Build = Literal["stillness", "utopia"]
Platform = Literal["darwin", "win32"]


class ClientNotFound(RuntimeError):
    """Raised when no usable client install can be located."""


def candidate_roots(home: Path, platform: Platform, build: Build) -> list[Path]:
    """Ordered list of paths to try for the given build."""
    server = f"{build}.servers.evefrontier.com"
    if platform == "darwin":
        return [
            home
            / "Library"
            / "Application Support"
            / "EVE Frontier"
            / "SharedCache"
            / build
            / "eve.app"
            / "Contents"
            / "Resources"
            / "build"
            / server,
        ]
    return [
        Path("C:/CCP/EVE Frontier") / build,
        Path("D:/CCP/EVE Frontier") / build,
        Path("C:/Games/EVE Frontier") / build,
        Path(os.environ.get("APPDATA", "C:/")) / "CCP" / "EVE Frontier" / build,
    ]


def _resfiles_dir(home: Path, platform: Platform, root: Path) -> Path:
    if platform == "darwin":
        return (
            home
            / "Library"
            / "Application Support"
            / "Frontier"
            / "SharedCache"
            / "ResFiles"
        )
    return root / "ResFiles"


def resolve_client_root(
    *,
    build: Build,
    override: Optional[Path] = None,
    home: Optional[Path] = None,
    platform: Optional[Platform] = None,
) -> ClientRoot:
    """Locate the installed EVE Frontier client for `build`.

    `override` short-circuits search. `home` and `platform` are injected for
    testing; in production they default to the current user and sys.platform.
    """
    home = home or Path.home()
    plat: Platform = platform or ("darwin" if sys.platform == "darwin" else "win32")
    server = f"{build}.servers.evefrontier.com"

    candidates: Iterable[Path] = [override] if override else candidate_roots(home, plat, build)

    for candidate in candidates:
        if candidate is None:
            continue
        stillness_dir = candidate / "stillness"
        if not stillness_dir.is_dir():
            continue
        bin_dir = stillness_dir / "bin64"
        resfiles_dir = _resfiles_dir(home, plat, candidate)
        return ClientRoot(
            build=build,
            server=server,
            root=candidate,
            stillness_dir=stillness_dir,
            resfiles_dir=resfiles_dir,
            bin_dir=bin_dir if bin_dir.is_dir() else None,
            platform=plat,
        )

    searched = "\n  ".join(str(p) for p in candidate_roots(home, plat, build))
    raise ClientNotFound(
        f"No EVE Frontier client found for build '{build}' on {plat}.\n"
        f"Searched:\n  {searched}\n"
        f"Pass --client-path /path/to/{server} to override."
    )
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_paths.py -q
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/paths.py scripts/extract/tests/test_paths.py
git commit -m "[extract] resolve client root on Windows and macOS"
```

---

### Task 5: Manifest module (`extract/manifest.py`)

Serializes per-run extraction metadata.

**Files:**
- Create: `scripts/extract/extract/manifest.py`
- Create: `scripts/extract/tests/test_manifest.py`

- [ ] **Step 1: Write the failing test — `scripts/extract/tests/test_manifest.py`**

```python
"""ExtractManifest round-trip tests."""

import json
from pathlib import Path

from extract.manifest import ExtractManifest, TargetSummary, save_manifest, load_manifest


def test_manifest_save_and_load_round_trip(tmp_path: Path):
    manifest = ExtractManifest(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        client_root="/Users/x/Library/Application Support/EVE Frontier/SharedCache/stillness",
        extracted_at="2026-06-06T16:42:11Z",
        python_version="3.12.4",
        platform="darwin",
        script_version="git:5dcd3af",
        targets={
            "types": TargetSummary(
                status="ok",
                source_path="res:/staticdata/types.fsdbinary",
                source_hash="deadbeef",
                row_count=47812,
            ),
            "icons": TargetSummary(status="skipped", reason="icons dir missing"),
        },
    )
    path = tmp_path / "manifest.json"
    save_manifest(manifest, path)

    raw = json.loads(path.read_text())
    assert raw["build"] == "stillness"
    assert raw["targets"]["types"]["rowCount"] == 47812
    assert raw["targets"]["icons"]["status"] == "skipped"

    loaded = load_manifest(path)
    assert loaded == manifest


def test_target_summary_optional_fields(tmp_path: Path):
    summary = TargetSummary(status="ok")
    manifest = ExtractManifest(
        build="utopia",
        server="utopia.servers.evefrontier.com",
        client_root="/tmp/x",
        extracted_at="2026-06-06T00:00:00Z",
        python_version="3.12.0",
        platform="win32",
        script_version="git:unknown",
        targets={"types": summary},
    )
    path = tmp_path / "m.json"
    save_manifest(manifest, path)
    raw = json.loads(path.read_text())
    assert raw["targets"]["types"] == {"status": "ok"}
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_manifest.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/manifest.py`**

```python
"""Per-run extraction manifest (JSON on disk)."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, Literal, Optional


@dataclass(frozen=True)
class TargetSummary:
    status: Literal["ok", "skipped", "fail"]
    source_path: Optional[str] = None
    source_hash: Optional[str] = None
    row_count: Optional[int] = None
    reason: Optional[str] = None


@dataclass(frozen=True)
class ExtractManifest:
    build: str
    server: str
    client_root: str
    extracted_at: str
    python_version: str
    platform: str
    script_version: str
    targets: Dict[str, TargetSummary] = field(default_factory=dict)


_SUMMARY_KEYS = {
    "status": "status",
    "source_path": "sourcePath",
    "source_hash": "sourceHash",
    "row_count": "rowCount",
    "reason": "reason",
}

_REVERSE_SUMMARY_KEYS = {v: k for k, v in _SUMMARY_KEYS.items()}


def _summary_to_json(summary: TargetSummary) -> Dict[str, object]:
    out: Dict[str, object] = {}
    for py_key, json_key in _SUMMARY_KEYS.items():
        value = getattr(summary, py_key)
        if value is not None:
            out[json_key] = value
    return out


def _summary_from_json(raw: Dict[str, object]) -> TargetSummary:
    kwargs: Dict[str, object] = {}
    for json_key, value in raw.items():
        py_key = _REVERSE_SUMMARY_KEYS.get(json_key)
        if py_key:
            kwargs[py_key] = value
    return TargetSummary(**kwargs)  # type: ignore[arg-type]


def save_manifest(manifest: ExtractManifest, path: Path) -> None:
    payload = {
        "build": manifest.build,
        "server": manifest.server,
        "clientRoot": manifest.client_root,
        "extractedAt": manifest.extracted_at,
        "pythonVersion": manifest.python_version,
        "platform": manifest.platform,
        "scriptVersion": manifest.script_version,
        "targets": {name: _summary_to_json(s) for name, s in manifest.targets.items()},
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_manifest(path: Path) -> ExtractManifest:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return ExtractManifest(
        build=raw["build"],
        server=raw["server"],
        client_root=raw["clientRoot"],
        extracted_at=raw["extractedAt"],
        python_version=raw["pythonVersion"],
        platform=raw["platform"],
        script_version=raw["scriptVersion"],
        targets={name: _summary_from_json(s) for name, s in raw["targets"].items()},
    )
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_manifest.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/manifest.py scripts/extract/tests/test_manifest.py
git commit -m "[extract] add per-run extraction manifest with JSON IO"
```

---

### Task 6: Loader wrapper (`extract/loader.py`)

Lazy import shim around CCP `.pyd`/`.so` loader modules in `bin64`.

**Files:**
- Create: `scripts/extract/extract/loader.py`
- Create: `scripts/extract/tests/test_loader.py`

- [ ] **Step 1: Write the failing test — `scripts/extract/tests/test_loader.py`**

```python
"""Loader shim tests."""

import sys
import types as pytypes
from pathlib import Path

from extract.loader import LoaderRegistry


def test_loader_returns_cached_module(tmp_path: Path):
    fake_bin = tmp_path / "bin64"
    fake_bin.mkdir()

    registry = LoaderRegistry(bin_dir=fake_bin)

    fake_module = pytypes.ModuleType("fakeLoader")
    fake_module.LOAD = lambda data: {"hello": "world"}  # type: ignore[attr-defined]
    sys.modules["fakeLoader"] = fake_module
    try:
        first = registry.get("fakeLoader")
        second = registry.get("fakeLoader")
        assert first is fake_module
        assert first is second
    finally:
        del sys.modules["fakeLoader"]


def test_loader_returns_none_when_missing(tmp_path: Path):
    registry = LoaderRegistry(bin_dir=tmp_path / "missing_bin")
    assert registry.get("notInstalledLoader") is None


def test_loader_handles_none_bin_dir():
    registry = LoaderRegistry(bin_dir=None)
    assert registry.get("anything") is None
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_loader.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/loader.py`**

```python
"""Lazy access to CCP-provided loader modules (.pyd/.so) in client's bin64."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from types import ModuleType
from typing import Dict, Optional


class LoaderRegistry:
    """Wraps importlib so loader modules from client bin64 are imported lazily.

    The client ships its own Python loader modules. Adding `bin_dir` to
    `sys.path` once allows importlib to pick them up. Failed imports return
    None so callers can decide how to degrade.
    """

    def __init__(self, bin_dir: Optional[Path]):
        self._bin_dir = bin_dir
        self._cache: Dict[str, Optional[ModuleType]] = {}
        self._sys_path_set = False

    def _ensure_on_path(self) -> None:
        if self._sys_path_set:
            return
        if self._bin_dir and self._bin_dir.is_dir():
            sys.path.insert(0, str(self._bin_dir))
        self._sys_path_set = True

    def get(self, module_name: str) -> Optional[ModuleType]:
        if module_name in self._cache:
            return self._cache[module_name]
        self._ensure_on_path()
        try:
            module = importlib.import_module(module_name)
        except ImportError:
            self._cache[module_name] = None
            return None
        self._cache[module_name] = module
        return module
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_loader.py -q
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/loader.py scripts/extract/tests/test_loader.py
git commit -m "[extract] add lazy loader registry for client bin64 modules"
```

---

### Task 7: Target registry and base contract (`extract/targets/__init__.py`)

Empty registry plus the topological sort. Each target module fills in `REGISTRY` later.

**Files:**
- Create: `scripts/extract/extract/targets/__init__.py`
- Create: `scripts/extract/tests/test_targets_registry.py`

- [ ] **Step 1: Write the failing test — `scripts/extract/tests/test_targets_registry.py`**

```python
"""Target registry sort and lookup tests."""

import pytest

from extract.targets import (
    TargetProtocol,
    register_target,
    registry_snapshot,
    topological_order,
    _CLEAR_FOR_TESTS,
)


class _FakeTarget:
    NAME = "fake"
    REQUIRED_RESOURCES: list[str] = []
    OPTIONAL_RESOURCES: list[str] = []
    OUTPUT_FILENAME = "fake.json"
    DEPENDS_ON: list[str] = []


def _make_target(name: str, depends_on: list[str]) -> TargetProtocol:
    t = _FakeTarget()
    t.NAME = name  # type: ignore[misc]
    t.DEPENDS_ON = depends_on  # type: ignore[misc]
    t.OUTPUT_FILENAME = f"{name}.json"  # type: ignore[misc]
    return t  # type: ignore[return-value]


@pytest.fixture(autouse=True)
def _reset_registry():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def test_register_and_lookup():
    register_target(_make_target("a", []))
    snapshot = registry_snapshot()
    assert "a" in snapshot


def test_topological_order_respects_dependencies():
    register_target(_make_target("a", []))
    register_target(_make_target("b", ["a"]))
    register_target(_make_target("c", ["b"]))
    order = [t.NAME for t in topological_order()]
    assert order.index("a") < order.index("b") < order.index("c")


def test_topological_order_detects_cycle():
    register_target(_make_target("x", ["y"]))
    register_target(_make_target("y", ["x"]))
    with pytest.raises(ValueError, match="cycle"):
        topological_order()


def test_register_rejects_duplicate():
    register_target(_make_target("a", []))
    with pytest.raises(ValueError, match="already registered"):
        register_target(_make_target("a", []))
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_targets_registry.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/targets/__init__.py`**

```python
"""Target registry for the extraction pipeline.

Each target module imports this module and calls `register_target(self)` at
import time. The registry exposes a topological sort over `DEPENDS_ON`.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Protocol

from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
)


class TargetProtocol(Protocol):
    """Contract every target module must implement."""

    NAME: str
    REQUIRED_RESOURCES: List[str]
    OPTIONAL_RESOURCES: List[str]
    OUTPUT_FILENAME: str
    DEPENDS_ON: List[str]

    def is_available(self, client: ClientRoot) -> AvailabilityResult: ...
    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult: ...
    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]: ...


_REGISTRY: Dict[str, TargetProtocol] = {}


def register_target(target: TargetProtocol) -> None:
    if target.NAME in _REGISTRY:
        raise ValueError(f"target {target.NAME!r} already registered")
    _REGISTRY[target.NAME] = target


def registry_snapshot() -> Dict[str, TargetProtocol]:
    return dict(_REGISTRY)


def topological_order() -> List[TargetProtocol]:
    """Return targets in dependency order. Raises ValueError on cycle."""
    visited: Dict[str, str] = {}  # name -> "open" | "closed"
    order: List[TargetProtocol] = []

    def visit(name: str) -> None:
        state = visited.get(name)
        if state == "closed":
            return
        if state == "open":
            raise ValueError(f"dependency cycle detected at target {name!r}")
        visited[name] = "open"
        target = _REGISTRY[name]
        for dep in target.DEPENDS_ON:
            if dep not in _REGISTRY:
                raise ValueError(f"target {name!r} depends on unknown target {dep!r}")
            visit(dep)
        visited[name] = "closed"
        order.append(target)

    for name in _REGISTRY:
        visit(name)
    return order


def _CLEAR_FOR_TESTS() -> None:
    """Test-only: reset the registry between tests."""
    _REGISTRY.clear()
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_targets_registry.py -q
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/targets/__init__.py \
        scripts/extract/tests/test_targets_registry.py
git commit -m "[extract] add target registry with topological dependency sort"
```

---

## Phase 2 — Discover

### Task 8: `discover.py` CLI

Discovery is the first CLI. It must work without any target modules existing yet — it inventories what's present.

**Files:**
- Create: `scripts/extract/extract/discover.py`
- Create: `scripts/extract/tests/test_discover.py`

- [ ] **Step 1: Write the failing test — `scripts/extract/tests/test_discover.py`**

```python
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
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_discover.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/discover.py`**

```python
"""discover CLI: inventory client resources and loaders."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from extract.paths import ClientNotFound, resolve_client_root
from extract.resindex import parse_resindex
from extract.types import ClientRoot


def build_discovery_report(client: ClientRoot, probe: Optional[str] = None) -> Dict[str, Any]:
    index_path = client.stillness_dir / "resfileindex.txt"
    index = parse_resindex(index_path)

    candidates = {logical: client.resfiles_dir / index[logical].hash_path for logical in index}
    candidate_status = {
        logical: f"{path} [{'found' if path.exists() else 'missing'}]"
        for logical, path in candidates.items()
    }

    loaders: Dict[str, str] = {}
    if client.bin_dir is not None and client.bin_dir.is_dir():
        for entry in sorted(client.bin_dir.iterdir()):
            if entry.suffix.lower() in {".pyd", ".so", ".dylib"}:
                loaders[entry.name] = "found"

    report: Dict[str, Any] = {
        "clientRoot": {
            "build": client.build,
            "server": client.server,
            "root": str(client.root),
            "stillnessDir": str(client.stillness_dir),
            "resfilesDir": str(client.resfiles_dir),
            "binDir": str(client.bin_dir) if client.bin_dir else None,
        },
        "platform": client.platform,
        "indexEntries": len(index),
        "candidates": candidate_status,
        "loaders": loaders,
    }

    if probe is not None:
        if probe in index:
            entry = index[probe]
            physical = client.resfiles_dir / entry.hash_path
            report["probe"] = {
                "logicalPath": probe,
                "physicalPath": str(physical),
                "exists": physical.exists(),
                "size": physical.stat().st_size if physical.exists() else None,
            }
        else:
            report["probe"] = {"logicalPath": probe, "error": "not in index"}
    return report


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="extract.discover")
    parser.add_argument("--build", required=True, choices=["stillness", "utopia"])
    parser.add_argument("--client-path", type=Path, default=None,
                        help="Override auto-detected client root")
    parser.add_argument("--json", action="store_true", help="Emit JSON only")
    parser.add_argument("--probe", type=str, default=None,
                        help="Probe a single logical res:/... path")
    parser.add_argument("--out", type=Path, default=None,
                        help="Write report to this file instead of stdout")
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv or sys.argv[1:])
    try:
        client = resolve_client_root(build=args.build, override=args.client_path)
    except ClientNotFound as err:
        sys.stderr.write(f"{err}\n")
        return 2

    report = build_discovery_report(client, probe=args.probe)

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        if not args.json:
            sys.stdout.write(f"Discovery report written to {args.out}\n")
        return 0

    if args.json:
        json.dump(report, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        sys.stdout.write(f"Build: {report['clientRoot']['build']} ({report['clientRoot']['server']})\n")
        sys.stdout.write(f"Client root: {report['clientRoot']['root']}\n")
        sys.stdout.write(f"Index entries: {report['indexEntries']}\n")
        sys.stdout.write(f"Loaders: {len(report['loaders'])}\n")
        for name in sorted(report["loaders"]):
            sys.stdout.write(f"  - {name}\n")
        if "probe" in report:
            sys.stdout.write(f"Probe: {json.dumps(report['probe'], indent=2)}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_discover.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/discover.py scripts/extract/tests/test_discover.py
git commit -m "[extract] add discover CLI for client inventory"
```

---

### Task 9: Real-world discover checkpoint (manual)

This is a **diagnostic checkpoint, not a code task.** Output informs later target implementations and exposes any spec hypothesis errors early.

**Files:**
- Update if needed: `docs/superpowers/specs/2026-06-06-static-data-extraction-pipeline-design.md`

- [ ] **Step 1: Run discover on the real macOS client**

```bash
pnpm extract:discover --build stillness --out /tmp/discovery-stillness.json
```

Expected: report file written; non-zero exit if client not found (in which case investigate `paths.py` against the real install).

- [ ] **Step 2: Inspect the report**

```bash
cat /tmp/discovery-stillness.json | python3.12 -m json.tool | less
```

Eyeball:
- Are `res:/staticdata/types.fsdbinary` and the other six target paths present?
- What loader files (.pyd / .so / .dylib) are in `bin64`?
- Is `binDir` even populated, or is it `null`? (macOS may not ship loaders.)

- [ ] **Step 3: Repeat for utopia**

```bash
pnpm extract:discover --build utopia --out /tmp/discovery-utopia.json
diff /tmp/discovery-stillness.json /tmp/discovery-utopia.json | head -40
```

Note any differences in available resources between builds.

- [ ] **Step 4: Update the spec if hypotheses were wrong**

If the actual logical paths or loader names differ from the spec's Section 5 table, edit `docs/superpowers/specs/2026-06-06-static-data-extraction-pipeline-design.md` and update the affected rows. Commit:

```bash
git add docs/superpowers/specs/2026-06-06-static-data-extraction-pipeline-design.md
git commit -m "[extract] update spec with actual resource paths from discover"
```

- [ ] **Step 5: Capture a small sample for use in target snapshot tests**

Pick a single small resource (e.g. `groups.fsdbinary` if it's the smallest of our targets) and copy the physical file into `scripts/extract/tests/fixtures/captured/groups.fsdbinary` for later snapshot tests. This is read-only test data, not committed (it's mined client data — add to gitignore via the existing `data/` rule does NOT cover this; explicitly ignore):

```bash
echo "scripts/extract/tests/fixtures/captured/" >> .gitignore
git add .gitignore
git commit -m "[extract] ignore captured client samples in test fixtures"
```

---

## Phase 3 — Targets

Each target follows the same TDD shape: write a test using either a stub loader or the captured sample, implement the target with the contract, register it. Tasks 10–16 are independent of each other after Task 9 — they can be done in any order.

### Task 10: `types` target

**Files:**
- Create: `scripts/extract/extract/targets/types.py`
- Create: `scripts/extract/tests/test_target_types.py`

- [ ] **Step 1: Write the failing test — `scripts/extract/tests/test_target_types.py`**

```python
"""types target tests using an injected loader."""

import json
from pathlib import Path

import pytest

from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.types import TypesTarget
from extract.types import ClientRoot


@pytest.fixture(autouse=True)
def _reset_registry():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _make_client_with_types(tmp_path: Path) -> ClientRoot:
    root = tmp_path / "client"
    stillness = root / "stillness"
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
        root=root,
        stillness_dir=stillness,
        resfiles_dir=resfiles,
        bin_dir=bin_dir,
        platform="darwin",
    )


def _fake_loader(_data: bytes) -> dict:
    return {
        459: {
            "typeNameID": 12345,
            "groupID": 53,
            "marketGroupID": 568,
            "metaGroupID": 1,
            "metaLevel": 0,
            "techLevel": 1,
            "basePrice": 0.0,
            "mass": 1000.0,
            "volume": 25.0,
            "capacity": 1.0,
            "radius": 1.0,
            "portionSize": 1,
            "published": 0,
            "graphicID": 11108,
            "iconID": 355,
            "descriptionID": 94509,
            "soundID": 100,
        }
    }


def _fake_localizer(name_id: int) -> str:
    return {12345: "Heavy Beam Laser I"}.get(name_id, f"Unknown #{name_id}")


def test_types_target_extracts_with_strip_data_compatible_shape(tmp_path: Path):
    client = _make_client_with_types(tmp_path)
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)

    target = TypesTarget(load_fsdbinary=_fake_loader, localize=_fake_localizer)
    result = target.extract(client, run_dir)

    assert result.status == "ok"
    assert result.row_count == 1
    data = json.loads((run_dir / "raw" / "types.json").read_text())
    assert "459" in data
    entry = data["459"]
    assert entry["typeID"] == 459
    assert entry["typeName_en-us"] == "Heavy Beam Laser I"
    assert entry["groupID"] == 53


def test_types_target_reports_unavailable_when_resource_missing(tmp_path: Path):
    client = _make_client_with_types(tmp_path)
    (client.stillness_dir / "resfileindex.txt").write_text("", encoding="utf-8")
    target = TypesTarget(load_fsdbinary=_fake_loader, localize=_fake_localizer)
    availability = target.is_available(client)
    assert availability.available is False
    assert "types.fsdbinary" in (availability.reason or "")
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_types.py -q
```

Expected: `ModuleNotFoundError: No module named 'extract.targets.types'`.

- [ ] **Step 3: Implement `scripts/extract/extract/targets/types.py`**

The actual loader call (the function passed as `load_fsdbinary`) depends on what `discover` revealed in Task 9. If a loader module exists in `bin64`, wire it via `LoaderRegistry`. If not, raise from `extract()` with a clear message.

```python
"""types target — emit data/raw/types.json shape."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, List, Optional

from extract.loader import LoaderRegistry
from extract.resindex import parse_resindex
from extract.targets import register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)

# Logical path confirmed by discover; update here if the spec changed in Task 9.
RESOURCE = "res:/staticdata/types.fsdbinary"
LOADER_MODULE = "typesLoader"  # update after discover if different


def _default_localizer(_name_id: int) -> str:
    return ""


class TypesTarget:
    NAME = "types"
    REQUIRED_RESOURCES = [RESOURCE]
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "types.json"
    DEPENDS_ON: List[str] = []

    def __init__(
        self,
        *,
        load_fsdbinary: Optional[Callable[[bytes], dict[int, dict[str, Any]]]] = None,
        localize: Callable[[int], str] = _default_localizer,
    ):
        """`load_fsdbinary` is injected for tests; production resolves via LoaderRegistry."""
        self._load = load_fsdbinary
        self._localize = localize

    def _ensure_loader(self, client: ClientRoot) -> Callable[[bytes], dict[int, dict[str, Any]]]:
        if self._load is not None:
            return self._load
        registry = LoaderRegistry(client.bin_dir)
        module = registry.get(LOADER_MODULE)
        if module is None:
            raise RuntimeError(
                f"Loader module {LOADER_MODULE!r} unavailable on this platform. "
                "Re-run on Windows where the CCP .pyd loader is present."
            )
        # CCP loaders typically expose a `LOAD(bytes) -> dict` callable.
        return module.LOAD  # type: ignore[no-any-return]

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        if RESOURCE not in index:
            return AvailabilityResult.missing(f"{RESOURCE} not in resfileindex")
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        availability = self.is_available(client)
        if not availability.available:
            return ExtractResult(status="skipped", error=availability.reason)

        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        physical = index.resolve(RESOURCE, client.resfiles_dir)
        load = self._ensure_loader(client)
        with physical.open("rb") as handle:
            raw = load(handle.read())

        out_dir = run_dir / "raw"
        out_dir.mkdir(parents=True, exist_ok=True)
        output: dict[str, dict[str, Any]] = {}
        for type_id, record in raw.items():
            stripped: dict[str, Any] = {"typeID": int(type_id)}
            for key, value in record.items():
                stripped[key] = value
            name_id = record.get("typeNameID")
            if isinstance(name_id, int):
                stripped["typeName_en-us"] = self._localize(name_id)
            output[str(int(type_id))] = stripped

        out_path = out_dir / self.OUTPUT_FILENAME
        out_path.write_text(json.dumps(output), encoding="utf-8")

        return ExtractResult(
            status="ok",
            output_path=out_path,
            row_count=len(output),
            source_path=RESOURCE,
        )

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        out_path = run_dir / "raw" / self.OUTPUT_FILENAME
        if not out_path.exists():
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "output file missing")]
        data = json.loads(out_path.read_text(encoding="utf-8"))
        issues: List[ValidationIssue] = []
        if not data:
            issues.append(ValidationIssue(ValidationSeverity.ERROR, self.NAME, "no rows extracted"))
        for key, entry in list(data.items())[:50]:
            if "typeID" not in entry or "groupID" not in entry:
                issues.append(ValidationIssue(
                    ValidationSeverity.ERROR, self.NAME,
                    f"row {key} missing typeID/groupID"))
        return issues


register_target(TypesTarget())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_types.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/targets/types.py \
        scripts/extract/tests/test_target_types.py
git commit -m "[extract] add types target with strip-data compatible JSON shape"
```

---

### Task 11: `groups` target

**Files:**
- Create: `scripts/extract/extract/targets/groups.py`
- Create: `scripts/extract/tests/test_target_groups.py`

- [ ] **Step 1: Write the failing test — `scripts/extract/tests/test_target_groups.py`**

```python
"""groups target tests."""

import json
from pathlib import Path

import pytest

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
        "res:/staticdata/groups.fsdbinary,cd/g.bin,gh,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "cd" / "g.bin").write_bytes(b"")
    return ClientRoot(
        build="stillness",
        server="stillness.servers.evefrontier.com",
        root=tmp_path / "client",
        stillness_dir=stillness,
        resfiles_dir=resfiles,
        bin_dir=bin_dir,
        platform="darwin",
    )


def _fake_loader(_data: bytes) -> dict:
    return {
        1: {"groupID": 1, "categoryID": 1, "groupNameID": 100, "anchorable": 0, "published": 0},
        465: {"groupID": 465, "categoryID": 25, "groupNameID": 200, "anchorable": 0, "published": 1},
    }


def _localize(name_id: int) -> str:
    return {100: "Character", 200: "Mineable Ores"}.get(name_id, "")


def test_groups_target_emits_strip_data_compatible_shape(tmp_path: Path):
    run_dir = tmp_path / "run"
    target = GroupsTarget(load_fsdbinary=_fake_loader, localize=_localize)
    result = target.extract(_make_client(tmp_path), run_dir)
    assert result.status == "ok"
    data = json.loads((run_dir / "raw" / "groups.json").read_text())
    assert data["465"]["groupName_en-us"] == "Mineable Ores"
    assert data["1"]["categoryID"] == 1
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_groups.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/targets/groups.py`**

```python
"""groups target — emit data/raw/groups.json shape."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, List, Optional

from extract.loader import LoaderRegistry
from extract.resindex import parse_resindex
from extract.targets import register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)

RESOURCE = "res:/staticdata/groups.fsdbinary"
LOADER_MODULE = "groupsLoader"


def _default_localizer(_name_id: int) -> str:
    return ""


class GroupsTarget:
    NAME = "groups"
    REQUIRED_RESOURCES = [RESOURCE]
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "groups.json"
    DEPENDS_ON: List[str] = []

    def __init__(
        self,
        *,
        load_fsdbinary: Optional[Callable[[bytes], dict[int, dict[str, Any]]]] = None,
        localize: Callable[[int], str] = _default_localizer,
    ):
        self._load = load_fsdbinary
        self._localize = localize

    def _ensure_loader(self, client: ClientRoot) -> Callable[[bytes], dict[int, dict[str, Any]]]:
        if self._load is not None:
            return self._load
        module = LoaderRegistry(client.bin_dir).get(LOADER_MODULE)
        if module is None:
            raise RuntimeError(
                f"Loader module {LOADER_MODULE!r} unavailable on this platform."
            )
        return module.LOAD  # type: ignore[no-any-return]

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        if RESOURCE not in index:
            return AvailabilityResult.missing(f"{RESOURCE} not in resfileindex")
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        if not self.is_available(client).available:
            return ExtractResult(status="skipped", error="resource missing")
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        physical = index.resolve(RESOURCE, client.resfiles_dir)
        load = self._ensure_loader(client)
        raw = load(physical.read_bytes())

        out_dir = run_dir / "raw"
        out_dir.mkdir(parents=True, exist_ok=True)
        output: dict[str, dict[str, Any]] = {}
        for group_id, record in raw.items():
            entry = dict(record)
            entry["groupID"] = int(group_id)
            name_id = record.get("groupNameID")
            if isinstance(name_id, int):
                entry["groupName_en-us"] = self._localize(name_id)
            output[str(int(group_id))] = entry

        out_path = out_dir / self.OUTPUT_FILENAME
        out_path.write_text(json.dumps(output), encoding="utf-8")
        return ExtractResult(
            status="ok", output_path=out_path,
            row_count=len(output), source_path=RESOURCE,
        )

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        out_path = run_dir / "raw" / self.OUTPUT_FILENAME
        if not out_path.exists():
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "output missing")]
        data = json.loads(out_path.read_text(encoding="utf-8"))
        if not data:
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "empty groups output")]
        issues: List[ValidationIssue] = []
        for key, entry in list(data.items())[:50]:
            if "groupID" not in entry or "categoryID" not in entry:
                issues.append(ValidationIssue(
                    ValidationSeverity.ERROR, self.NAME,
                    f"row {key} missing groupID/categoryID"))
        return issues


register_target(GroupsTarget())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_groups.py -q
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/targets/groups.py \
        scripts/extract/tests/test_target_groups.py
git commit -m "[extract] add groups target"
```

---

### Task 12: `industry_blueprints` target

**Files:**
- Create: `scripts/extract/extract/targets/industry_blueprints.py`
- Create: `scripts/extract/tests/test_target_industry_blueprints.py`

- [ ] **Step 1: Write the failing test — `scripts/extract/tests/test_target_industry_blueprints.py`**

```python
"""industry_blueprints target tests."""

import json
from pathlib import Path

import pytest

from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.industry_blueprints import IndustryBlueprintsTarget
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
    (resfiles / "11").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/industry/industry_blueprints.fsdbinary,11/b.bin,h,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "11" / "b.bin").write_bytes(b"")
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


def _fake_loader(_data: bytes) -> dict:
    return {
        1000: {
            "primaryTypeID": 88561,
            "runTime": 4,
            "inputs": [
                {"typeID": 89258, "quantity": 140},
                {"typeID": 89259, "quantity": 90},
            ],
            "outputs": [{"typeID": 88561, "quantity": 14}],
        }
    }


def test_blueprints_emit_expected_shape(tmp_path: Path):
    run_dir = tmp_path / "run"
    result = IndustryBlueprintsTarget(load_fsdbinary=_fake_loader).extract(_client(tmp_path), run_dir)
    assert result.status == "ok"
    data = json.loads((run_dir / "raw" / "industry_blueprints.json").read_text())
    assert data["1000"]["primaryTypeID"] == 88561
    assert data["1000"]["inputs"][0] == {"typeID": 89258, "quantity": 140}
    assert data["1000"]["outputs"][0]["quantity"] == 14
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_industry_blueprints.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/targets/industry_blueprints.py`**

```python
"""industry_blueprints target — emit data/raw/industry_blueprints.json shape."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, List, Optional

from extract.loader import LoaderRegistry
from extract.resindex import parse_resindex
from extract.targets import register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)

RESOURCE = "res:/staticdata/industry/industry_blueprints.fsdbinary"
LOADER_MODULE = "industryBlueprintsLoader"


class IndustryBlueprintsTarget:
    NAME = "industry_blueprints"
    REQUIRED_RESOURCES = [RESOURCE]
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "industry_blueprints.json"
    DEPENDS_ON: List[str] = []

    def __init__(
        self,
        *,
        load_fsdbinary: Optional[Callable[[bytes], dict[int, dict[str, Any]]]] = None,
    ):
        self._load = load_fsdbinary

    def _ensure_loader(self, client: ClientRoot) -> Callable[[bytes], dict[int, dict[str, Any]]]:
        if self._load is not None:
            return self._load
        module = LoaderRegistry(client.bin_dir).get(LOADER_MODULE)
        if module is None:
            raise RuntimeError(f"Loader {LOADER_MODULE!r} unavailable on this platform.")
        return module.LOAD  # type: ignore[no-any-return]

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        if RESOURCE not in index:
            return AvailabilityResult.missing(f"{RESOURCE} not in resfileindex")
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        if not self.is_available(client).available:
            return ExtractResult(status="skipped", error="resource missing")
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        physical = index.resolve(RESOURCE, client.resfiles_dir)
        raw = self._ensure_loader(client)(physical.read_bytes())

        out_dir = run_dir / "raw"
        out_dir.mkdir(parents=True, exist_ok=True)
        output: dict[str, dict[str, Any]] = {}
        for bp_id, record in raw.items():
            output[str(int(bp_id))] = {
                "primaryTypeID": int(record["primaryTypeID"]),
                "runTime": int(record.get("runTime", 0)),
                "inputs": [
                    {"typeID": int(i["typeID"]), "quantity": int(i["quantity"])}
                    for i in record.get("inputs", [])
                ],
                "outputs": [
                    {"typeID": int(o["typeID"]), "quantity": int(o["quantity"])}
                    for o in record.get("outputs", [])
                ],
            }

        out_path = out_dir / self.OUTPUT_FILENAME
        out_path.write_text(json.dumps(output), encoding="utf-8")
        return ExtractResult(
            status="ok", output_path=out_path,
            row_count=len(output), source_path=RESOURCE,
        )

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        out_path = run_dir / "raw" / self.OUTPUT_FILENAME
        if not out_path.exists():
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "output missing")]
        data = json.loads(out_path.read_text(encoding="utf-8"))
        issues: List[ValidationIssue] = []
        if not data:
            issues.append(ValidationIssue(ValidationSeverity.ERROR, self.NAME, "no blueprints"))
        # Join check: every input/output typeID must appear in types.json (if present).
        types_path = run_dir / "raw" / "types.json"
        if types_path.exists():
            types_keys = set(json.loads(types_path.read_text(encoding="utf-8")).keys())
            missing: set[str] = set()
            for record in data.values():
                for entry in record.get("inputs", []) + record.get("outputs", []):
                    if str(entry["typeID"]) not in types_keys:
                        missing.add(str(entry["typeID"]))
            if missing:
                issues.append(ValidationIssue(
                    ValidationSeverity.ERROR, self.NAME,
                    f"{len(missing)} typeIDs referenced by blueprints missing from types"))
        return issues


register_target(IndustryBlueprintsTarget())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_industry_blueprints.py -q
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/targets/industry_blueprints.py \
        scripts/extract/tests/test_target_industry_blueprints.py
git commit -m "[extract] add industry_blueprints target"
```

---

### Task 13: `industry_facilities` target

**Files:**
- Create: `scripts/extract/extract/targets/industry_facilities.py`
- Create: `scripts/extract/tests/test_target_industry_facilities.py`

- [ ] **Step 1: Write the failing test**

```python
"""industry_facilities target tests."""

import json
from pathlib import Path

import pytest

from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.industry_facilities import IndustryFacilitiesTarget
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
    (resfiles / "22").mkdir(parents=True)
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/industry/industry_facilities.fsdbinary,22/f.bin,h,0,10\n",
        encoding="utf-8",
    )
    (resfiles / "22" / "f.bin").write_bytes(b"")
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


def _fake_loader(_data: bytes) -> dict:
    return {
        87654: {
            "blueprints": [
                {"blueprintID": 1026, "maxInputRuns": 219, "maxOutputRuns": 334},
            ],
            "inputCapacity": 1200,
            "outputCapacity": 1000,
        }
    }


def test_facilities_emit_expected_shape(tmp_path: Path):
    run_dir = tmp_path / "run"
    target = IndustryFacilitiesTarget(load_fsdbinary=_fake_loader)
    result = target.extract(_client(tmp_path), run_dir)
    assert result.status == "ok"
    data = json.loads((run_dir / "raw" / "industry_facilities.json").read_text())
    assert data["87654"]["inputCapacity"] == 1200
    assert data["87654"]["blueprints"][0]["blueprintID"] == 1026
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_industry_facilities.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/targets/industry_facilities.py`**

```python
"""industry_facilities target."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, List, Optional

from extract.loader import LoaderRegistry
from extract.resindex import parse_resindex
from extract.targets import register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)

RESOURCE = "res:/staticdata/industry/industry_facilities.fsdbinary"
LOADER_MODULE = "industryFacilitiesLoader"


class IndustryFacilitiesTarget:
    NAME = "industry_facilities"
    REQUIRED_RESOURCES = [RESOURCE]
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "industry_facilities.json"
    DEPENDS_ON: List[str] = []

    def __init__(self, *, load_fsdbinary: Optional[Callable[[bytes], dict[int, dict[str, Any]]]] = None):
        self._load = load_fsdbinary

    def _ensure_loader(self, client: ClientRoot) -> Callable[[bytes], dict[int, dict[str, Any]]]:
        if self._load is not None:
            return self._load
        module = LoaderRegistry(client.bin_dir).get(LOADER_MODULE)
        if module is None:
            raise RuntimeError(f"Loader {LOADER_MODULE!r} unavailable on this platform.")
        return module.LOAD  # type: ignore[no-any-return]

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        if RESOURCE not in index:
            return AvailabilityResult.missing(f"{RESOURCE} not in resfileindex")
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        if not self.is_available(client).available:
            return ExtractResult(status="skipped", error="resource missing")
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        raw = self._ensure_loader(client)(index.resolve(RESOURCE, client.resfiles_dir).read_bytes())

        out_dir = run_dir / "raw"
        out_dir.mkdir(parents=True, exist_ok=True)
        output: dict[str, dict[str, Any]] = {}
        for fac_id, record in raw.items():
            output[str(int(fac_id))] = {
                "blueprints": [
                    {
                        "blueprintID": int(bp["blueprintID"]),
                        "maxInputRuns": int(bp.get("maxInputRuns", 0)),
                        "maxOutputRuns": int(bp.get("maxOutputRuns", 0)),
                    }
                    for bp in record.get("blueprints", [])
                ],
                "inputCapacity": int(record.get("inputCapacity", 0)),
                "outputCapacity": int(record.get("outputCapacity", 0)),
            }
        out_path = out_dir / self.OUTPUT_FILENAME
        out_path.write_text(json.dumps(output), encoding="utf-8")
        return ExtractResult(
            status="ok", output_path=out_path,
            row_count=len(output), source_path=RESOURCE,
        )

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        out_path = run_dir / "raw" / self.OUTPUT_FILENAME
        if not out_path.exists():
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "output missing")]
        data = json.loads(out_path.read_text(encoding="utf-8"))
        return [ValidationIssue(ValidationSeverity.WARNING, self.NAME, "no facilities found")] if not data else []


register_target(IndustryFacilitiesTarget())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_industry_facilities.py -q
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/targets/industry_facilities.py \
        scripts/extract/tests/test_target_industry_facilities.py
git commit -m "[extract] add industry_facilities target"
```

---

### Task 14: `solarsystems` target

The current `data/raw/solarsystems.json` is an array of `{id, name, constellationId, regionId, location}`. The most likely source is a `starmapcache.pickle` (per spec §5), but a fsdbinary universe file is also plausible. Discover (Task 9) will have confirmed.

**Files:**
- Create: `scripts/extract/extract/targets/solarsystems.py`
- Create: `scripts/extract/tests/test_target_solarsystems.py`

- [ ] **Step 1: Write the failing test**

```python
"""solarsystems target tests."""

import json
import pickle
from pathlib import Path

import pytest

from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.solarsystems import SolarsystemsTarget
from extract.types import ClientRoot


@pytest.fixture(autouse=True)
def _reset():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _client_with_pickle(tmp_path: Path) -> ClientRoot:
    stillness = tmp_path / "c" / "stillness"
    bin_dir = stillness / "bin64"
    resfiles = tmp_path / "rf"
    bin_dir.mkdir(parents=True)
    (resfiles / "33").mkdir(parents=True)

    pickle_path = resfiles / "33" / "smc.pickle"
    payload = {
        30000142: {"name": "Jita", "constellationID": 20000020, "regionID": 10000002,
                   "center": (1.0, 2.0, 3.0)},
        30000001: {"name": "Tanoo", "constellationID": 20000001, "regionID": 10000001,
                   "center": (4.0, 5.0, 6.0)},
    }
    pickle_path.write_bytes(pickle.dumps(payload))
    (stillness / "resfileindex.txt").write_text(
        "res:/staticdata/starmapcache.pickle,33/smc.pickle,h,0,10\n",
        encoding="utf-8",
    )
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


def test_solarsystems_target_reads_pickle_and_emits_array(tmp_path: Path):
    run_dir = tmp_path / "run"
    target = SolarsystemsTarget()
    result = target.extract(_client_with_pickle(tmp_path), run_dir)
    assert result.status == "ok"
    data = json.loads((run_dir / "raw" / "solarsystems.json").read_text())
    assert isinstance(data, list)
    names = {row["name"] for row in data}
    assert names == {"Jita", "Tanoo"}
    jita = next(r for r in data if r["name"] == "Jita")
    assert jita["regionId"] == 10000002
    assert jita["constellationId"] == 20000020
    assert jita["location"] == [1.0, 2.0, 3.0]
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_solarsystems.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/targets/solarsystems.py`**

```python
"""solarsystems target — emit data/raw/solarsystems.json array shape."""

from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Any, List

from extract.resindex import parse_resindex
from extract.targets import register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)

# Confirmed in Task 9 — update if discover revealed a different source.
RESOURCE = "res:/staticdata/starmapcache.pickle"


class SolarsystemsTarget:
    NAME = "solarsystems"
    REQUIRED_RESOURCES = [RESOURCE]
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "solarsystems.json"
    DEPENDS_ON: List[str] = []

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        if RESOURCE not in index:
            return AvailabilityResult.missing(f"{RESOURCE} not in resfileindex")
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        if not self.is_available(client).available:
            return ExtractResult(status="skipped", error="resource missing")
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        physical = index.resolve(RESOURCE, client.resfiles_dir)
        raw = pickle.loads(physical.read_bytes())

        rows: list[dict[str, Any]] = []
        for system_id, record in raw.items():
            center = record.get("center", (0.0, 0.0, 0.0))
            rows.append({
                "id": int(system_id),
                "name": record.get("name", ""),
                "constellationId": int(record.get("constellationID", 0)),
                "regionId": int(record.get("regionID", 0)),
                "location": [float(center[0]), float(center[1]), float(center[2])],
            })
        rows.sort(key=lambda r: r["id"])

        out_dir = run_dir / "raw"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / self.OUTPUT_FILENAME
        out_path.write_text(json.dumps(rows), encoding="utf-8")
        return ExtractResult(
            status="ok", output_path=out_path,
            row_count=len(rows), source_path=RESOURCE,
        )

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        out_path = run_dir / "raw" / self.OUTPUT_FILENAME
        if not out_path.exists():
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "output missing")]
        data = json.loads(out_path.read_text(encoding="utf-8"))
        if not isinstance(data, list) or not data:
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "empty or wrong-shape")]
        issues: List[ValidationIssue] = []
        for row in data[:50]:
            if not all(k in row for k in ("id", "name", "constellationId", "regionId")):
                issues.append(ValidationIssue(
                    ValidationSeverity.ERROR, self.NAME,
                    f"row missing required keys: {row}"))
                break
        return issues


register_target(SolarsystemsTarget())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_solarsystems.py -q
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/targets/solarsystems.py \
        scripts/extract/tests/test_target_solarsystems.py
git commit -m "[extract] add solarsystems target reading starmapcache.pickle"
```

---

### Task 15: `spacecomponents` target

**Files:**
- Create: `scripts/extract/extract/targets/spacecomponents.py`
- Create: `scripts/extract/tests/test_target_spacecomponents.py`

- [ ] **Step 1: Write the failing test**

```python
"""spacecomponentsbytype target tests."""

import json
from pathlib import Path

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
    (resfiles / "44" / "s.bin").write_bytes(b"")
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


def _fake_loader(_data: bytes) -> dict:
    return {
        77777: {
            "assemblyConstruction": {
                "constructedItem": 88561,
                "inputItems": {"89258": 140, "89259": 90},
            }
        }
    }


def test_spacecomponents_emit_assembly_construction(tmp_path: Path):
    run_dir = tmp_path / "run"
    result = SpaceComponentsTarget(load_fsdbinary=_fake_loader).extract(_client(tmp_path), run_dir)
    assert result.status == "ok"
    data = json.loads((run_dir / "raw" / "spacecomponentsbytype.json").read_text())
    assert data["77777"]["assemblyConstruction"]["constructedItem"] == 88561
    assert data["77777"]["assemblyConstruction"]["inputItems"] == {"89258": 140, "89259": 90}
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_spacecomponents.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/targets/spacecomponents.py`**

```python
"""spacecomponentsbytype target — emit raw assemblyConstruction records."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, List, Optional

from extract.loader import LoaderRegistry
from extract.resindex import parse_resindex
from extract.targets import register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)

RESOURCE = "res:/staticdata/spacecomponentsbytype.fsdbinary"
LOADER_MODULE = "spaceComponentsByTypeLoader"


class SpaceComponentsTarget:
    NAME = "spacecomponents"
    REQUIRED_RESOURCES = [RESOURCE]
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "spacecomponentsbytype.json"
    DEPENDS_ON: List[str] = []

    def __init__(self, *, load_fsdbinary: Optional[Callable[[bytes], dict[int, dict[str, Any]]]] = None):
        self._load = load_fsdbinary

    def _ensure_loader(self, client: ClientRoot) -> Callable[[bytes], dict[int, dict[str, Any]]]:
        if self._load is not None:
            return self._load
        module = LoaderRegistry(client.bin_dir).get(LOADER_MODULE)
        if module is None:
            raise RuntimeError(f"Loader {LOADER_MODULE!r} unavailable on this platform.")
        return module.LOAD  # type: ignore[no-any-return]

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        if RESOURCE not in index:
            return AvailabilityResult.missing(f"{RESOURCE} not in resfileindex")
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        if not self.is_available(client).available:
            return ExtractResult(status="skipped", error="resource missing")
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        raw = self._ensure_loader(client)(index.resolve(RESOURCE, client.resfiles_dir).read_bytes())

        out_dir = run_dir / "raw"
        out_dir.mkdir(parents=True, exist_ok=True)
        output: dict[str, dict[str, Any]] = {}
        for type_id, record in raw.items():
            ac = record.get("assemblyConstruction")
            if not ac:
                continue
            output[str(int(type_id))] = {
                "assemblyConstruction": {
                    "constructedItem": int(ac["constructedItem"]),
                    "inputItems": {str(k): int(v) for k, v in ac.get("inputItems", {}).items()},
                }
            }
        out_path = out_dir / self.OUTPUT_FILENAME
        out_path.write_text(json.dumps(output), encoding="utf-8")
        return ExtractResult(
            status="ok", output_path=out_path,
            row_count=len(output), source_path=RESOURCE,
        )

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        out_path = run_dir / "raw" / self.OUTPUT_FILENAME
        if not out_path.exists():
            return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "output missing")]
        return []


register_target(SpaceComponentsTarget())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_spacecomponents.py -q
```

Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/targets/spacecomponents.py \
        scripts/extract/tests/test_target_spacecomponents.py
git commit -m "[extract] add spacecomponents target for assemblyConstruction"
```

---

### Task 16: `icons` target

Depends on `types` — only copies icons referenced by extracted typeIDs.

**Files:**
- Create: `scripts/extract/extract/targets/icons.py`
- Create: `scripts/extract/tests/test_target_icons.py`

- [ ] **Step 1: Write the failing test**

```python
"""icons target tests."""

import json
from pathlib import Path

import pytest

from extract.targets import _CLEAR_FOR_TESTS
from extract.targets.icons import IconsTarget
from extract.types import ClientRoot


@pytest.fixture(autouse=True)
def _reset():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _client_with_icons(tmp_path: Path) -> ClientRoot:
    stillness = tmp_path / "c" / "stillness"
    bin_dir = stillness / "bin64"
    resfiles = tmp_path / "rf"
    bin_dir.mkdir(parents=True)
    icon_root = stillness / "icons" / "items"
    icon_root.mkdir(parents=True)
    (icon_root / "11.png").write_bytes(b"PNG-11")
    (icon_root / "22.png").write_bytes(b"PNG-22")
    return ClientRoot(
        build="stillness", server="x", root=tmp_path / "c",
        stillness_dir=stillness, resfiles_dir=resfiles,
        bin_dir=bin_dir, platform="darwin",
    )


def test_icons_target_copies_only_referenced_icons(tmp_path: Path):
    client = _client_with_icons(tmp_path)
    run_dir = tmp_path / "run"
    (run_dir / "raw").mkdir(parents=True)
    (run_dir / "raw" / "types.json").write_text(json.dumps({
        "459": {"typeID": 459, "iconID": 11},
        "460": {"typeID": 460, "iconID": 99},  # missing icon — should be skipped silently
    }), encoding="utf-8")

    result = IconsTarget(icon_root_relative=Path("icons/items")).extract(client, run_dir)
    assert result.status == "ok"
    assert (run_dir / "raw" / "icons" / "11.png").read_bytes() == b"PNG-11"
    assert not (run_dir / "raw" / "icons" / "22.png").exists()
    assert not (run_dir / "raw" / "icons" / "99.png").exists()


def test_icons_target_skipped_when_types_missing(tmp_path: Path):
    client = _client_with_icons(tmp_path)
    run_dir = tmp_path / "run"
    result = IconsTarget(icon_root_relative=Path("icons/items")).extract(client, run_dir)
    assert result.status == "skipped"
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_icons.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/targets/icons.py`**

```python
"""icons target — copy icons referenced by extracted types."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import List

from extract.targets import register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)


class IconsTarget:
    NAME = "icons"
    REQUIRED_RESOURCES: List[str] = []
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "icons"  # directory, not a file
    DEPENDS_ON: List[str] = ["types"]

    def __init__(self, *, icon_root_relative: Path = Path("icons/items")):
        self._icon_root_relative = icon_root_relative

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        root = client.stillness_dir / self._icon_root_relative
        if not root.is_dir():
            return AvailabilityResult.missing(f"icon directory {root} not found")
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        types_path = run_dir / "raw" / "types.json"
        if not types_path.exists():
            return ExtractResult(status="skipped", error="types.json not extracted")
        if not self.is_available(client).available:
            return ExtractResult(status="skipped", error="icon directory missing in client")

        types_data = json.loads(types_path.read_text(encoding="utf-8"))
        wanted: set[int] = set()
        for entry in types_data.values():
            icon_id = entry.get("iconID")
            if isinstance(icon_id, int) and icon_id > 0:
                wanted.add(icon_id)

        source_root = client.stillness_dir / self._icon_root_relative
        out_dir = run_dir / "raw" / "icons"
        out_dir.mkdir(parents=True, exist_ok=True)
        copied = 0
        for icon_id in wanted:
            src = source_root / f"{icon_id}.png"
            if src.exists():
                shutil.copy2(src, out_dir / f"{icon_id}.png")
                copied += 1

        return ExtractResult(
            status="ok", output_path=out_dir, row_count=copied,
            source_path=str(self._icon_root_relative),
        )

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        icons_dir = run_dir / "raw" / "icons"
        if not icons_dir.is_dir():
            return [ValidationIssue(ValidationSeverity.WARNING, self.NAME, "icons directory missing")]
        return []


register_target(IconsTarget())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_target_icons.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/targets/icons.py scripts/extract/tests/test_target_icons.py
git commit -m "[extract] add icons target, copy only typeID-referenced icons"
```

---

## Phase 4 — Extract CLI

### Task 17: `extract.py` CLI — orchestrates target runs into a run-dir

**Files:**
- Create: `scripts/extract/extract/extract.py`
- Create: `scripts/extract/tests/test_extract_cli.py`

- [ ] **Step 1: Write the failing test**

```python
"""extract CLI tests using injected dummy registry."""

import json
import sys
from pathlib import Path
from typing import List

import pytest

from extract.extract import run_extract
from extract.targets import _CLEAR_FOR_TESTS, register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
)


class _DummyTarget:
    NAME = "dummy"
    REQUIRED_RESOURCES: List[str] = []
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "dummy.json"
    DEPENDS_ON: List[str] = []

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        out = run_dir / "raw" / self.OUTPUT_FILENAME
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"hi": "there"}), encoding="utf-8")
        return ExtractResult(status="ok", output_path=out, row_count=1, source_path="res:/x")

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        return []


@pytest.fixture(autouse=True)
def _reset():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _client(tmp_path: Path) -> ClientRoot:
    return ClientRoot(
        build="stillness", server="stillness.servers.evefrontier.com",
        root=tmp_path / "c", stillness_dir=tmp_path / "c" / "stillness",
        resfiles_dir=tmp_path / "rf",
        bin_dir=None, platform="darwin",
    )


def test_run_extract_creates_run_dir_with_manifest(tmp_path: Path):
    register_target(_DummyTarget())
    runs_root = tmp_path / "runs"

    run_dir = run_extract(
        client=_client(tmp_path),
        runs_root=runs_root,
        target_names=None,  # all
        now="2026-06-06T16:42:11Z",
        script_version="git:test",
    )

    assert run_dir.exists()
    assert (run_dir / "raw" / "dummy.json").exists()
    manifest = json.loads((run_dir / "manifest.json").read_text())
    assert manifest["build"] == "stillness"
    assert manifest["targets"]["dummy"]["status"] == "ok"
    assert manifest["targets"]["dummy"]["rowCount"] == 1


def test_run_extract_target_subset(tmp_path: Path):
    register_target(_DummyTarget())
    runs_root = tmp_path / "runs"
    run_dir = run_extract(
        client=_client(tmp_path), runs_root=runs_root,
        target_names=["dummy"], now="2026-06-06T16:42:11Z",
        script_version="git:test",
    )
    assert (run_dir / "raw" / "dummy.json").exists()


def test_run_extract_unknown_target_raises(tmp_path: Path):
    register_target(_DummyTarget())
    with pytest.raises(ValueError, match="unknown target"):
        run_extract(
            client=_client(tmp_path), runs_root=tmp_path / "r",
            target_names=["nope"], now="2026-06-06T16:42:11Z",
            script_version="git:test",
        )
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_extract_cli.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/extract.py`**

```python
"""extract CLI: produce a timestamped run-dir with raw target outputs + manifest."""

from __future__ import annotations

import argparse
import datetime as dt
import logging
import platform as platform_mod
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

from extract.manifest import ExtractManifest, TargetSummary, save_manifest
from extract.paths import ClientNotFound, resolve_client_root
from extract.targets import registry_snapshot, topological_order
from extract.types import ClientRoot, ExtractResult

LOG = logging.getLogger("extract")


def _git_short_sha() -> str:
    try:
        return "git:" + subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except Exception:
        return "git:unknown"


def _import_all_targets() -> None:
    """Force-import every target module so its register_target() runs."""
    # Importing the package's `targets` namespace doesn't auto-import submodules;
    # we list them explicitly so registration is deterministic.
    from extract.targets import (  # noqa: F401
        types as _types,
        groups as _groups,
        industry_blueprints as _bp,
        industry_facilities as _fac,
        solarsystems as _ss,
        spacecomponents as _sc,
        icons as _icons,
    )


def _now_utc_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ts_for_dir(now: str) -> str:
    return now.replace("-", "").replace(":", "").replace("T", "-").replace("Z", "")


def run_extract(
    *,
    client: ClientRoot,
    runs_root: Path,
    target_names: Optional[List[str]],
    now: str,
    script_version: str,
) -> Path:
    registry = registry_snapshot()
    if not registry:
        raise RuntimeError("no targets registered — import target modules first")

    if target_names is None:
        ordered = topological_order()
    else:
        for name in target_names:
            if name not in registry:
                raise ValueError(f"unknown target {name!r} (have: {sorted(registry)})")
        # Run in registry order but filter
        ordered = [t for t in topological_order() if t.NAME in set(target_names)]

    run_dir = runs_root / f"{client.build}-{client.server}-{_ts_for_dir(now)}"
    (run_dir / "raw").mkdir(parents=True, exist_ok=True)
    log_path = run_dir / "extract.log"
    logging.basicConfig(filename=log_path, level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    summaries: dict[str, TargetSummary] = {}
    for target in ordered:
        LOG.info("running target %s", target.NAME)
        try:
            result: ExtractResult = target.extract(client, run_dir)
        except Exception as err:  # one target failing should not kill others
            LOG.exception("target %s failed", target.NAME)
            summaries[target.NAME] = TargetSummary(status="fail", reason=str(err))
            continue
        summaries[target.NAME] = TargetSummary(
            status=result.status,
            source_path=result.source_path,
            source_hash=result.source_hash,
            row_count=result.row_count if result.row_count else None,
            reason=result.error,
        )

    manifest = ExtractManifest(
        build=client.build, server=client.server,
        client_root=str(client.root), extracted_at=now,
        python_version=".".join(map(str, sys.version_info[:3])),
        platform=client.platform, script_version=script_version,
        targets=summaries,
    )
    save_manifest(manifest, run_dir / "manifest.json")
    return run_dir


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="extract.extract")
    p.add_argument("--build", required=True, choices=["stillness", "utopia"])
    p.add_argument("--client-path", type=Path, default=None)
    p.add_argument("--target", action="append", default=None,
                   help="Target name (repeatable). Omit to run all.")
    p.add_argument("--all", action="store_true", help="Explicitly run all targets")
    p.add_argument("--runs-root", type=Path, default=Path("data/extracted"))
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv or sys.argv[1:])
    _import_all_targets()
    try:
        client = resolve_client_root(build=args.build, override=args.client_path)
    except ClientNotFound as err:
        sys.stderr.write(f"{err}\n")
        return 2

    target_names = None if (args.all or args.target is None) else args.target
    run_dir = run_extract(
        client=client,
        runs_root=args.runs_root,
        target_names=target_names,
        now=_now_utc_iso(),
        script_version=_git_short_sha(),
    )
    sys.stdout.write(f"Run directory: {run_dir}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_extract_cli.py -q
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/extract.py scripts/extract/tests/test_extract_cli.py
git commit -m "[extract] add extract CLI producing run-dir with manifest"
```

---

## Phase 5 — Validate, Promote, Orchestrator

### Task 18: `validate.py` CLI — gating module

**Files:**
- Create: `scripts/extract/extract/validate.py`
- Create: `scripts/extract/tests/test_validate_cli.py`

- [ ] **Step 1: Write the failing test**

```python
"""validate CLI tests."""

import json
from pathlib import Path
from typing import List

import pytest

from extract.targets import _CLEAR_FOR_TESTS, register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
    ValidationSeverity,
)
from extract.validate import build_validation_report, write_validation_report


class _GoodTarget:
    NAME = "good"
    REQUIRED_RESOURCES: List[str] = []
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "good.json"
    DEPENDS_ON: List[str] = []

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        raise NotImplementedError

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        return []


class _BadTarget(_GoodTarget):
    NAME = "bad"

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        return [ValidationIssue(ValidationSeverity.ERROR, self.NAME, "broken join")]


@pytest.fixture(autouse=True)
def _reset():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _client(tmp_path: Path) -> ClientRoot:
    return ClientRoot(
        build="stillness", server="x",
        root=tmp_path, stillness_dir=tmp_path,
        resfiles_dir=tmp_path, bin_dir=None, platform="darwin",
    )


def _run_dir(tmp_path: Path) -> Path:
    rd = tmp_path / "run"
    (rd / "raw").mkdir(parents=True)
    return rd


def test_validation_passes_when_all_targets_clean(tmp_path: Path):
    register_target(_GoodTarget())
    report = build_validation_report(_client(tmp_path), _run_dir(tmp_path))
    assert report["status"] == "pass"
    assert report["errors"] == []


def test_validation_fails_on_any_error(tmp_path: Path):
    register_target(_GoodTarget())
    register_target(_BadTarget())
    report = build_validation_report(_client(tmp_path), _run_dir(tmp_path))
    assert report["status"] == "fail"
    assert len(report["errors"]) == 1
    assert report["errors"][0]["target"] == "bad"


def test_write_validation_report_writes_file(tmp_path: Path):
    register_target(_GoodTarget())
    rd = _run_dir(tmp_path)
    report = build_validation_report(_client(tmp_path), rd)
    write_validation_report(report, rd)
    saved = json.loads((rd / "validation-report.json").read_text())
    assert saved["status"] == "pass"
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_validate_cli.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/validate.py`**

```python
"""validate CLI: gate before promote."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from extract.manifest import load_manifest
from extract.paths import resolve_client_root
from extract.targets import registry_snapshot
from extract.types import ClientRoot, ValidationSeverity


def build_validation_report(client: ClientRoot, run_dir: Path) -> Dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    for target in registry_snapshot().values():
        for issue in target.validate(client, run_dir):
            row = {"target": issue.target, "message": issue.message}
            if issue.severity == ValidationSeverity.ERROR:
                errors.append(row)
            else:
                warnings.append(row)

    status = "pass" if not errors else "fail"
    return {
        "status": status,
        "errors": errors,
        "warnings": warnings,
        "runDir": str(run_dir),
    }


def write_validation_report(report: Dict[str, Any], run_dir: Path) -> Path:
    out = run_dir / "validation-report.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return out


def _import_all_targets() -> None:
    from extract.targets import (  # noqa: F401
        types as _t, groups as _g,
        industry_blueprints as _bp, industry_facilities as _fac,
        solarsystems as _ss, spacecomponents as _sc, icons as _ic,
    )


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="extract.validate")
    p.add_argument("run_dir", type=Path)
    p.add_argument("--client-path", type=Path, default=None,
                   help="Override; otherwise read from manifest.json")
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv or sys.argv[1:])
    _import_all_targets()
    manifest = load_manifest(args.run_dir / "manifest.json")
    client = resolve_client_root(
        build=manifest.build,  # type: ignore[arg-type]
        override=args.client_path or Path(manifest.client_root),
    )
    report = build_validation_report(client, args.run_dir)
    out_path = write_validation_report(report, args.run_dir)
    sys.stdout.write(f"Validation: {report['status']} ({len(report['errors'])} errors, "
                     f"{len(report['warnings'])} warnings). Report: {out_path}\n")
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_validate_cli.py -q
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/validate.py scripts/extract/tests/test_validate_cli.py
git commit -m "[extract] add validate CLI gating promote step"
```

---

### Task 19: `promote.py` CLI

**Files:**
- Create: `scripts/extract/extract/promote.py`
- Create: `scripts/extract/tests/test_promote_cli.py`

- [ ] **Step 1: Write the failing test**

```python
"""promote CLI tests."""

import json
from pathlib import Path

import pytest

from extract.promote import PromoteRefused, promote_run


def _seed_run_dir(tmp_path: Path, status: str = "pass") -> Path:
    rd = tmp_path / "run"
    (rd / "raw").mkdir(parents=True)
    (rd / "raw" / "types.json").write_text(json.dumps({"1": {"typeID": 1}}), encoding="utf-8")
    (rd / "raw" / "industry_blueprints.json").write_text(json.dumps({}), encoding="utf-8")
    (rd / "manifest.json").write_text(json.dumps({
        "build": "stillness", "server": "x", "clientRoot": "/tmp/x",
        "extractedAt": "2026-06-06T00:00:00Z", "pythonVersion": "3.12.0",
        "platform": "darwin", "scriptVersion": "git:x", "targets": {},
    }), encoding="utf-8")
    (rd / "validation-report.json").write_text(json.dumps({
        "status": status, "errors": [], "warnings": [], "runDir": str(rd),
    }), encoding="utf-8")
    return rd


def test_promote_refuses_when_validation_failed(tmp_path: Path):
    rd = _seed_run_dir(tmp_path, status="fail")
    with pytest.raises(PromoteRefused, match="validation"):
        promote_run(run_dir=rd, raw_dir=tmp_path / "data" / "raw",
                    now="20260606-000000")


def test_promote_moves_existing_raw_to_backup(tmp_path: Path):
    rd = _seed_run_dir(tmp_path)
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    (raw_dir / "old.json").write_text("old", encoding="utf-8")

    promote_run(run_dir=rd, raw_dir=raw_dir, now="20260606-000000")

    backup_dir = raw_dir.parent / "raw.bak.20260606-000000"
    assert backup_dir.exists()
    assert (backup_dir / "old.json").read_text() == "old"
    assert (raw_dir / "types.json").exists()
    source = json.loads((raw_dir / ".source.json").read_text())
    assert source["runDir"] == str(rd)


def test_promote_rolls_single_backup(tmp_path: Path):
    rd = _seed_run_dir(tmp_path)
    raw_dir = tmp_path / "data" / "raw"
    raw_dir.mkdir(parents=True)
    (raw_dir / "old.json").write_text("old", encoding="utf-8")
    older_backup = raw_dir.parent / "raw.bak.20260101-000000"
    older_backup.mkdir()
    (older_backup / "ancient.json").write_text("a", encoding="utf-8")

    promote_run(run_dir=rd, raw_dir=raw_dir, now="20260606-000000")

    assert not older_backup.exists(), "older backup must be pruned"
    assert (raw_dir.parent / "raw.bak.20260606-000000").exists()
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_promote_cli.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/promote.py`**

```python
"""promote CLI: copy a validated run into data/raw/."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import sys
from pathlib import Path
from typing import Optional


class PromoteRefused(RuntimeError):
    pass


def _now_dir_ts() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")


def _prune_old_backups(raw_parent: Path, keep_name: str) -> None:
    for entry in raw_parent.iterdir():
        if entry.name.startswith("raw.bak.") and entry.name != keep_name:
            shutil.rmtree(entry)


def promote_run(*, run_dir: Path, raw_dir: Path, now: str) -> None:
    report_path = run_dir / "validation-report.json"
    if not report_path.exists():
        raise PromoteRefused(f"validation-report.json missing at {report_path}")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("status") != "pass":
        raise PromoteRefused(
            f"validation status is {report.get('status')!r}; refusing promote"
        )

    raw_parent = raw_dir.parent
    raw_parent.mkdir(parents=True, exist_ok=True)

    if raw_dir.exists():
        backup_name = f"raw.bak.{now}"
        # Collision guard.
        suffix = 0
        candidate = raw_parent / backup_name
        while candidate.exists():
            suffix += 1
            candidate = raw_parent / f"{backup_name}.{suffix}"
        shutil.move(str(raw_dir), str(candidate))
        _prune_old_backups(raw_parent, candidate.name)

    raw_dir.mkdir(parents=True)
    source_raw = run_dir / "raw"
    for entry in source_raw.iterdir():
        dest = raw_dir / entry.name
        if entry.is_dir():
            shutil.copytree(entry, dest)
        else:
            shutil.copy2(entry, dest)

    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))
    (raw_dir / ".source.json").write_text(json.dumps({
        "runDir": str(run_dir),
        "manifest": manifest,
        "promotedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }, indent=2), encoding="utf-8")


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="extract.promote")
    p.add_argument("run_dir", type=Path)
    p.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv or sys.argv[1:])
    try:
        promote_run(run_dir=args.run_dir, raw_dir=args.raw_dir, now=_now_dir_ts())
    except PromoteRefused as err:
        sys.stderr.write(f"refused: {err}\n")
        return 1
    sys.stdout.write(f"Promoted {args.run_dir} → {args.raw_dir}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_promote_cli.py -q
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract/extract/promote.py scripts/extract/tests/test_promote_cli.py
git commit -m "[extract] add promote CLI with backup rotation"
```

---

### Task 20: `update_static_data.py` orchestrator + manual smoke

**Files:**
- Create: `scripts/extract/extract/update_static_data.py`
- Create: `scripts/extract/tests/test_update_static_data.py`
- Create: `docs/static-data-extraction.md`

- [ ] **Step 1: Write the failing test**

```python
"""update_static_data orchestrator test (no real client)."""

import json
import sys
from pathlib import Path
from typing import List
from unittest.mock import patch

import pytest

from extract.targets import _CLEAR_FOR_TESTS, register_target
from extract.types import (
    AvailabilityResult,
    ClientRoot,
    ExtractResult,
    ValidationIssue,
)
from extract.update_static_data import run_pipeline


class _TrivialTarget:
    NAME = "trivial"
    REQUIRED_RESOURCES: List[str] = []
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "trivial.json"
    DEPENDS_ON: List[str] = []

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        out = run_dir / "raw" / self.OUTPUT_FILENAME
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"k": 1}), encoding="utf-8")
        return ExtractResult(status="ok", output_path=out, row_count=1)

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        return []


@pytest.fixture(autouse=True)
def _reset():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def _client(tmp_path: Path) -> ClientRoot:
    return ClientRoot(
        build="stillness", server="x",
        root=tmp_path, stillness_dir=tmp_path,
        resfiles_dir=tmp_path, bin_dir=None, platform="darwin",
    )


def test_pipeline_extract_validate_promote_happy_path(tmp_path: Path):
    register_target(_TrivialTarget())
    raw_dir = tmp_path / "data" / "raw"
    runs_root = tmp_path / "data" / "extracted"

    with patch("extract.update_static_data._confirm", return_value=True):
        rc = run_pipeline(
            client=_client(tmp_path),
            runs_root=runs_root,
            raw_dir=raw_dir,
            yes=True,
        )
    assert rc == 0
    assert (raw_dir / "trivial.json").exists()
    assert (raw_dir / ".source.json").exists()


def test_pipeline_aborts_when_user_says_no(tmp_path: Path):
    register_target(_TrivialTarget())
    raw_dir = tmp_path / "data" / "raw"
    runs_root = tmp_path / "data" / "extracted"

    with patch("extract.update_static_data._confirm", return_value=False):
        rc = run_pipeline(
            client=_client(tmp_path),
            runs_root=runs_root,
            raw_dir=raw_dir,
            yes=False,
        )
    assert rc == 3
    assert not raw_dir.exists()  # no promote happened
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_update_static_data.py -q
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `scripts/extract/extract/update_static_data.py`**

```python
"""update_static_data: end-to-end orchestration for pre-release runs."""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path
from typing import Optional

from extract.extract import run_extract, _import_all_targets, _now_utc_iso, _git_short_sha
from extract.paths import ClientNotFound, resolve_client_root
from extract.promote import PromoteRefused, promote_run
from extract.types import ClientRoot
from extract.validate import build_validation_report, write_validation_report


def _confirm(prompt: str) -> bool:
    answer = input(prompt).strip().lower()
    return answer in {"y", "yes"}


def _now_dir_ts() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")


def run_pipeline(
    *,
    client: ClientRoot,
    runs_root: Path,
    raw_dir: Path,
    yes: bool,
) -> int:
    _import_all_targets()

    sys.stdout.write(f"[1/4] discover (implicit via paths): {client.root}\n")
    sys.stdout.write("[2/4] extract...\n")
    run_dir = run_extract(
        client=client, runs_root=runs_root, target_names=None,
        now=_now_utc_iso(), script_version=_git_short_sha(),
    )
    sys.stdout.write(f"      run-dir: {run_dir}\n")

    sys.stdout.write("[3/4] validate...\n")
    report = build_validation_report(client, run_dir)
    write_validation_report(report, run_dir)
    sys.stdout.write(
        f"      status: {report['status']} "
        f"({len(report['errors'])} errors, {len(report['warnings'])} warnings)\n"
    )
    if report["status"] != "pass":
        sys.stderr.write("Validation failed; not promoting. Inspect "
                         f"{run_dir / 'validation-report.json'}.\n")
        return 1

    if not yes:
        if not _confirm(f"Promote {run_dir} to {raw_dir}? [y/N] "):
            sys.stdout.write("Aborted by user.\n")
            return 3

    sys.stdout.write("[4/4] promote...\n")
    try:
        promote_run(run_dir=run_dir, raw_dir=raw_dir, now=_now_dir_ts())
    except PromoteRefused as err:
        sys.stderr.write(f"refused: {err}\n")
        return 1
    sys.stdout.write(f"Promoted to {raw_dir}\n")
    return 0


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="extract.update_static_data")
    p.add_argument("--build", required=True, choices=["stillness", "utopia"])
    p.add_argument("--client-path", type=Path, default=None)
    p.add_argument("--runs-root", type=Path, default=Path("data/extracted"))
    p.add_argument("--raw-dir", type=Path, default=Path("data/raw"))
    p.add_argument("--yes", action="store_true",
                   help="Skip promote confirmation (for scripts/CI)")
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = _parse_args(argv or sys.argv[1:])
    try:
        client = resolve_client_root(build=args.build, override=args.client_path)
    except ClientNotFound as err:
        sys.stderr.write(f"{err}\n")
        return 2
    return run_pipeline(
        client=client, runs_root=args.runs_root,
        raw_dir=args.raw_dir, yes=args.yes,
    )


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd scripts/extract && .venv/bin/pytest tests/test_update_static_data.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Create the operator-facing doc — `docs/static-data-extraction.md`**

```markdown
# Refreshing static data before a release

Before every release, refresh `data/raw/` from the local EVE Frontier install.

## Prereqs (one-time)

- Python 3.12 on PATH.
- Install the extractor:

  ```bash
  cd scripts/extract
  python3.12 -m venv .venv
  .venv/bin/pip install -e .[dev]
  source .venv/bin/activate
  ```

## Routine flow

From the repo root:

```bash
pnpm update-static-data --build stillness
```

The orchestrator:

1. Resolves the client install (macOS: `~/Library/Application Support/EVE Frontier/SharedCache/...`; Windows: `C:\CCP\EVE Frontier\<build>`).
2. Extracts every registered target into `data/extracted/<build>-<server>-<ts>/raw/`.
3. Validates the run; writes `validation-report.json`.
4. Asks for confirmation, then moves the previous `data/raw/` to `data/raw.bak.<ts>/` and promotes the new files in.

`pnpm strip-data` then converts `data/raw/` into `data/stripped/` for the app build.

## When something fails

| Symptom | What to do |
|---|---|
| `Loader 'xLoader' unavailable on this platform.` on macOS | Re-run on a Windows machine that has the same client build. The macOS install may not ship CCP loader modules. |
| Validation `fail` with broken joins | Open `data/extracted/<run>/validation-report.json`. The likely cause is a patch that renamed/dropped typeIDs. Compare against the previous run's `manifest.json` (rolling backup in `data/raw.bak.<prev-ts>/` if you've already promoted). |
| `No EVE Frontier client found` | Pass `--client-path /path/to/<server>` explicitly, or check that the launcher has finished downloading the build. |
| You need to verify what's available without extracting | `pnpm extract:discover --build stillness --out /tmp/d.json`, then read it. |

## Running individual stages

```bash
pnpm extract:discover --build stillness --out /tmp/d.json
pnpm extract:run --build stillness --target types --target groups
pnpm extract:validate data/extracted/<run-dir>
pnpm extract:promote data/extracted/<run-dir>
```
```

- [ ] **Step 6: Manual end-to-end smoke**

```bash
pnpm update-static-data --build stillness
```

Expected: 4 stage messages, validation `pass`, prompt to confirm promote. After confirming, `data/raw/` contains the six JSON files + `icons/`. Then:

```bash
pnpm strip-data
```

Expected: prints sizes for `types.json`, `oreGroupIDs.json`, `structure_recipes.json`. No errors.

If anything fails at this stage:
- Read the failing target's source path in `data/extracted/<run-dir>/validation-report.json` and `manifest.json`.
- If the spec's hypothesis about a loader name or resource path is wrong, fix it in the affected `extract/targets/*.py` module and re-run. This is the iterative loop the spec anticipates.

- [ ] **Step 7: Commit**

```bash
git add scripts/extract/extract/update_static_data.py \
        scripts/extract/tests/test_update_static_data.py \
        docs/static-data-extraction.md
git commit -m "[extract] add orchestrator, operator docs, run end-to-end smoke"
```

---

## Self-review notes

After the plan was drafted I ran the checks the writing-plans skill prescribes.

**Spec coverage (every section/requirement in `2026-06-06-static-data-extraction-pipeline-design.md` mapped to a task):**

| Spec section | Task |
|---|---|
| §2 Python 3.12 runtime | 1 |
| §2 cross-platform | 1 (env), 4 (paths) |
| §3.1 file layout (paths, resindex, loader, manifest, types, targets/*) | 2–7, 10–16 |
| §3.2 CLI surface | 8, 17, 18, 19, 20 |
| §3.3 ClientRoot dataclass | 2, 4 |
| §3.3 IndexEntry / parser | 2, 3 |
| §3.3 LoaderRegistry | 6 |
| §3.3 ExtractManifest | 5 |
| §3.3 TargetProtocol + REGISTRY + topo sort | 7 |
| §3.4 run-dir shape (raw/, manifest.json, validation-report.json) | 17, 18 |
| §3.5 promote behavior (validation gate, backup, .source.json) | 19 |
| §4 data flow end-to-end | 20 |
| §5 targets table (types, groups, industry_blueprints, industry_facilities, solarsystems, spacecomponents, icons) | 10–16 |
| §6 error handling | covered piecewise in each task (loader missing, resource missing, broken joins in validators, promote refusal in 19, Ctrl-C path is best-effort via run-dir persistence in 17) |
| §7 testing strategy (unit + golden + no live-client) | 2–16 unit tests, 9 captured sample fixture, 20 manual smoke |
| §8 risks | flagged in 9 (real-world discover) and 20 (smoke + troubleshooting) |

No gaps left.

**Placeholder scan:** No TBD/TODO/"implement later" left. The two intentional points where the actual loader names/paths are hypotheses (target modules and Task 9) are explicitly labelled as such and have an actionable resolution (run discover, edit one constant per target).

**Type consistency:** Names match across tasks — `ClientRoot`, `IndexEntry`, `ResIndex`, `LoaderRegistry`, `ExtractResult`, `ValidationIssue`, `ValidationSeverity`, `TargetSummary`, `ExtractManifest`, `register_target`, `topological_order`, `build_validation_report`, `promote_run`. Module names match imports (`extract.targets.types` not `extract.targets.Types`). Function signatures consistent (`run_extract(client=..., runs_root=..., target_names=..., now=..., script_version=...)` used the same way in Task 17's test and Task 20's orchestrator).
