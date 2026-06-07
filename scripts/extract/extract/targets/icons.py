"""icons target — copy per-typeID icons referenced by types.json.

Two resolution paths, in priority order per type:

1. **iconID** → `iconIDsLoader` → `iconFile` (a single `res:/...` path).
   Used for most inventory items, materials, and modules.
2. **graphicID** → `graphicIDsLoader` → `iconInfo.folder`. The folder holds
   per-size renders named `<graphicID>_64.png`, `<graphicID>_128.png`, etc.
   Used for ships, structures, drones, deployables — anything with a 3D
   model. We always pick the 64px variant to match iconID file sizes.

Once a `res:/...` path is determined for a typeID, lookup cascades:

1. **Cache** (`data/cdn-cache/<2hex>/<hash>`) — survives between runs.
2. **Client local** (`<client>/ResFiles/<2hex>/<hash>`) — fastest when present.
3. **CDN** (`https://resources.shared.reitnorf.com/<2hex>/<hash>`) — gzip-wrapped.

Every successful fetch (local or CDN) populates the cache, so the next run
only re-downloads icons that the client patched in since.

Output: `<run-dir>/raw/icons/<typeID>.png`.
"""

from __future__ import annotations

import gzip
import json
import shutil
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable, Iterable, List, Optional, Tuple

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

RESOURCE = "res:/staticdata/iconids.fsdbinary"
LOADER_MODULE = "iconIDsLoader"
GRAPHICS_RESOURCE = "res:/staticdata/graphicids.fsdbinary"
GRAPHICS_LOADER_MODULE = "graphicIDsLoader"
# Match the size CCP packs into iconids.fsdbinary so both paths produce
# comparable assets. 64×64 is what `iconIDsLoader` files weigh in at.
GRAPHICS_ICON_SIZE = 64

# CCP shared resource CDN — discovered in the launcher's app.asar.
# Files are gzip-wrapped on the wire; we decompress before writing.
CDN_BASE = "https://resources.shared.reitnorf.com"
CDN_TIMEOUT_SECONDS = 15
CDN_PARALLEL = 16

# Hash-addressed cache for CDN payloads and copies of local resfiles. Sits
# outside data/raw/ so it survives promote rotation. Repo-root-relative.
DEFAULT_CACHE_DIR = Path("data/cdn-cache")


def _default_loader_factory(client: ClientRoot) -> Any:
    module = LoaderRegistry(client.bin_dir).get(LOADER_MODULE)
    if module is None:
        raise RuntimeError(
            f"Loader module {LOADER_MODULE!r} not found in {client.bin_dir}. "
            "On macOS, the CLI entry must call ensure_dyld_env_or_reexec() first."
        )
    return module


def _default_graphics_loader_factory(client: ClientRoot) -> Any:
    module = LoaderRegistry(client.bin_dir).get(GRAPHICS_LOADER_MODULE)
    if module is None:
        raise RuntimeError(
            f"Loader module {GRAPHICS_LOADER_MODULE!r} not found in {client.bin_dir}. "
            "On macOS, the CLI entry must call ensure_dyld_env_or_reexec() first."
        )
    return module


def _default_cdn_fetcher(hash_path: str) -> bytes:
    """Fetch a single file from CCP's shared resource CDN, decompressed."""
    url = f"{CDN_BASE}/{hash_path}"
    with urllib.request.urlopen(url, timeout=CDN_TIMEOUT_SECONDS) as resp:
        body = resp.read()
    # CDN wraps payloads in gzip regardless of underlying content-type.
    try:
        return gzip.decompress(body)
    except OSError:
        # Not gzipped — return as-is (defensive; shouldn't happen in practice).
        return body


CdnFetcher = Callable[[str], bytes]


def _seed_cache(cache_dir: Optional[Path], hash_path: str, payload: bytes) -> None:
    """Write `payload` into the hash-addressed cache. Best-effort."""
    if cache_dir is None:
        return
    cached = cache_dir / hash_path
    try:
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(payload)
    except OSError:
        pass


class IconsTarget:
    NAME = "icons"
    REQUIRED_RESOURCES = [RESOURCE]
    OPTIONAL_RESOURCES: List[str] = []
    OUTPUT_FILENAME = "icons"
    DEPENDS_ON: List[str] = ["types"]

    def __init__(
        self,
        *,
        loader_factory: Optional[Callable[[ClientRoot], Any]] = None,
        graphics_loader_factory: Optional[Callable[[ClientRoot], Any]] = None,
        cdn_fetcher: Optional[CdnFetcher] = None,
        cdn_enabled: bool = True,
        cdn_parallel: int = CDN_PARALLEL,
        cache_dir: Optional[Path] = DEFAULT_CACHE_DIR,
    ):
        self._loader_factory = loader_factory or _default_loader_factory
        self._graphics_loader_factory = (
            graphics_loader_factory or _default_graphics_loader_factory
        )
        self._cdn_fetcher = cdn_fetcher or _default_cdn_fetcher
        self._cdn_enabled = cdn_enabled
        self._cdn_parallel = cdn_parallel
        self._cache_dir = cache_dir

    def is_available(self, client: ClientRoot) -> AvailabilityResult:
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        if RESOURCE not in index:
            return AvailabilityResult.missing(f"{RESOURCE} not in resfileindex")
        return AvailabilityResult.ok()

    def extract(self, client: ClientRoot, run_dir: Path) -> ExtractResult:
        types_path = run_dir / "raw" / "types.json"
        if not types_path.exists():
            return ExtractResult(status="skipped", error="types.json not extracted")

        availability = self.is_available(client)
        if not availability.available:
            return ExtractResult(status="skipped", error=availability.reason)

        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        physical = index.resolve(RESOURCE, client.resfiles_dir)
        loader = self._loader_factory(client)

        icon_records = loader.load(str(physical))
        icon_path_by_id: dict[int, str] = {}
        for icon_id in icon_records:
            rec = icon_records[icon_id]
            try:
                icon_path_by_id[int(icon_id)] = getattr(rec, "iconFile", "") or ""
            except (TypeError, ValueError):
                continue

        types_data = json.loads(types_path.read_text(encoding="utf-8"))
        ci_index: dict[str, Any] = {logical.lower(): index[logical] for logical in index}

        out_dir = run_dir / "raw" / "icons"
        out_dir.mkdir(parents=True, exist_ok=True)

        cache_dir = self._cache_dir
        if cache_dir is not None:
            cache_dir.mkdir(parents=True, exist_ok=True)

        # Phase A: resolve every typeID to a logical resource path via iconID
        # first, then fall back to graphicID. Types resolved here go through
        # the cache/local/CDN cascade below.
        resolved: List[Tuple[int, str]] = []  # (typeID, resource_path)
        graphic_jobs: List[Tuple[int, int]] = []  # (typeID, graphicID) deferred to graphics loader

        for type_key, entry in types_data.items():
            try:
                type_id_int = int(type_key)
            except ValueError:
                continue

            icon_id = entry.get("iconID")
            if isinstance(icon_id, int) and icon_id > 0:
                res_path = icon_path_by_id.get(icon_id)
                if res_path:
                    resolved.append((type_id_int, res_path))
                    continue

            graphic_id = entry.get("graphicID")
            if isinstance(graphic_id, int) and graphic_id > 0:
                graphic_jobs.append((type_id_int, graphic_id))

        # Phase B: resolve graphicID → folder/<gid>_64.png. Loader is invoked
        # lazily because most existing callers (and tests) don't need it.
        if graphic_jobs:
            graphic_folder_by_id = self._load_graphic_folders(client)
            for type_id_int, graphic_id in graphic_jobs:
                folder = graphic_folder_by_id.get(graphic_id)
                if not folder:
                    continue
                # CCP convention: each graphic folder holds size-suffixed PNGs
                # keyed by the graphicID. Folder strings sometimes carry a
                # trailing slash, sometimes don't.
                res_path = f"{folder.rstrip('/')}/{graphic_id}_{GRAPHICS_ICON_SIZE}.png"
                resolved.append((type_id_int, res_path))

        cdn_jobs: List[Tuple[int, str]] = []  # (typeID, hash_path)
        copied_cache = 0
        copied_local = 0

        for type_id_int, res_path in resolved:
            ci_entry = ci_index.get(res_path.lower())
            if ci_entry is None:
                continue

            dst = out_dir / f"{type_id_int}.png"
            hash_path = ci_entry.hash_path

            # 1. Cache (survives between runs).
            if cache_dir is not None:
                cached = cache_dir / hash_path
                if cached.is_file():
                    shutil.copy2(cached, dst)
                    copied_cache += 1
                    continue

            # 2. Client local (also seeds the cache for next run).
            physical_icon = client.resfiles_dir / hash_path
            if physical_icon.exists():
                shutil.copy2(physical_icon, dst)
                _seed_cache(cache_dir, hash_path, physical_icon.read_bytes())
                copied_local += 1
                continue

            # 3. CDN — defer to a parallel batch.
            if self._cdn_enabled:
                cdn_jobs.append((type_id_int, hash_path))

        cdn_ok, _cdn_fail = self._fetch_cdn_batch(cdn_jobs, out_dir)

        return ExtractResult(
            status="ok",
            output_path=out_dir,
            row_count=copied_cache + copied_local + cdn_ok,
            source_path=RESOURCE,
        )

    def _load_graphic_folders(self, client: ClientRoot) -> dict[int, str]:
        """Load graphicID → iconInfo.folder map. Returns {} if unavailable."""
        index = parse_resindex(client.stillness_dir / "resfileindex.txt")
        if GRAPHICS_RESOURCE not in index:
            return {}
        try:
            physical = index.resolve(GRAPHICS_RESOURCE, client.resfiles_dir)
            loader = self._graphics_loader_factory(client)
            records = loader.load(str(physical))
        except Exception:
            # Graphics path is best-effort. iconID coverage already succeeded
            # by the time we get here, so we silently fall through.
            return {}

        folder_by_id: dict[int, str] = {}
        for gid in records:
            rec = records[gid]
            icon_info = getattr(rec, "iconInfo", None)
            if icon_info is None:
                continue
            folder = getattr(icon_info, "folder", "") or ""
            if not folder:
                continue
            try:
                folder_by_id[int(gid)] = folder
            except (TypeError, ValueError):
                continue
        return folder_by_id

    def _fetch_cdn_batch(
        self,
        jobs: Iterable[Tuple[int, str]],
        out_dir: Path,
    ) -> Tuple[int, int]:
        """Download missing icons from the CDN in parallel.

        Successful payloads are also written into the hash cache for the next
        run. Returns (ok_count, fail_count).
        """
        jobs = list(jobs)
        if not jobs:
            return 0, 0
        cache_dir = self._cache_dir
        ok = 0
        fail = 0
        with ThreadPoolExecutor(max_workers=self._cdn_parallel) as pool:
            future_to_job = {
                pool.submit(self._cdn_fetcher, hash_path): (type_id, hash_path)
                for type_id, hash_path in jobs
            }
            for future in as_completed(future_to_job):
                type_id, hash_path = future_to_job[future]
                try:
                    payload = future.result()
                except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
                    fail += 1
                    continue
                dst = out_dir / f"{type_id}.png"
                dst.write_bytes(payload)
                _seed_cache(cache_dir, hash_path, payload)
                ok += 1
        return ok, fail

    def validate(self, client: ClientRoot, run_dir: Path) -> List[ValidationIssue]:
        icons_dir = run_dir / "raw" / "icons"
        if not icons_dir.is_dir():
            return [ValidationIssue(ValidationSeverity.WARNING, self.NAME, "icons directory missing")]

        types_path = run_dir / "raw" / "types.json"
        if not types_path.exists():
            return []

        try:
            types_data = json.loads(types_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []

        expected = 0
        missing = 0
        for type_key, entry in types_data.items():
            has_icon = isinstance(entry.get("iconID"), int) and entry["iconID"] > 0
            has_graphic = isinstance(entry.get("graphicID"), int) and entry["graphicID"] > 0
            if not (has_icon or has_graphic):
                continue
            expected += 1
            try:
                type_id_int = int(type_key)
            except ValueError:
                continue
            if not (icons_dir / f"{type_id_int}.png").is_file():
                missing += 1

        if missing == 0:
            return []
        pct = (missing / expected * 100) if expected else 0
        return [
            ValidationIssue(
                ValidationSeverity.WARNING,
                self.NAME,
                f"{missing}/{expected} types ({pct:.1f}%) reference an icon/graphic but have no <typeID>.png",
            )
        ]


register_target(IconsTarget())
