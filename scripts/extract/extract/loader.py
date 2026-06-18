"""Access to CCP-provided loader modules in client's bin64.

On macOS the CCP loader `.so` modules depend on `@rpath/libpython3.12.dylib`,
where the @rpath baked in at CCP build time no longer exists. We make the
extension findable by:

1. Pointing `DYLD_LIBRARY_PATH` at the host Python's libpython dir.
   `DYLD_*` env vars are only consulted by dyld at process startup, so we
   re-exec ourselves once if the var is missing on macOS.

2. Copying the loader `.so` into a temp directory and importing it from there.
   The loader caches its physical state by `(temp_dir, mtime)`, so we keep
   the temp dir alive for the process lifetime.
"""

from __future__ import annotations

import importlib
import os
import shutil
import sys
import sysconfig
import tempfile
from pathlib import Path
from types import ModuleType
from typing import Dict, Optional


_DYLD_VAR = "DYLD_LIBRARY_PATH"


def _libpython_dir() -> Optional[Path]:
    """Where libpython<X.Y>.dylib (or equivalent on win32) lives."""
    candidate = sysconfig.get_config_var("LIBDIR")
    return Path(candidate) if candidate else None


def ensure_dyld_env_or_reexec() -> None:
    """On macOS, make sure DYLD_LIBRARY_PATH contains the libpython dir.

    If not, set it and `os.execv` the current process so dyld can see it.
    No-op on Windows. Idempotent.
    """
    if sys.platform != "darwin":
        return
    libdir = _libpython_dir()
    if libdir is None or not libdir.is_dir():
        return
    current = os.environ.get(_DYLD_VAR, "")
    parts = [p for p in current.split(":") if p]
    if str(libdir) in parts:
        return
    parts.insert(0, str(libdir))
    new_env = os.environ.copy()
    new_env[_DYLD_VAR] = ":".join(parts)
    os.execvpe(sys.executable, [sys.executable, *sys.argv], new_env)


class LoaderRegistry:
    """Imports CCP loader modules from a temp-copy of the client bin64.

    Call `get(name)` (without the `.so`/`.pyd` suffix). Returns the imported
    module, or None if the source file does not exist on disk.

    Caller must ensure DYLD_LIBRARY_PATH was set before the Python process
    started — call `ensure_dyld_env_or_reexec()` first thing in `main()` of
    any CLI that uses real loaders.
    """

    _suffix_search_order = (".so", ".pyd")

    def __init__(self, bin_dir: Optional[Path]):
        self._bin_dir = bin_dir
        self._cache: Dict[str, Optional[ModuleType]] = {}
        self._temp_dir: Optional[Path] = None

    def _ensure_temp_dir(self) -> Path:
        if self._temp_dir is None:
            self._temp_dir = Path(tempfile.mkdtemp(prefix="powerlay-extract-"))
            sys.path.insert(0, str(self._temp_dir))
        return self._temp_dir

    def _find_loader_file(self, module_name: str) -> Optional[Path]:
        if self._bin_dir is None or not self._bin_dir.is_dir():
            return None
        for suffix in self._suffix_search_order:
            candidate = self._bin_dir / f"{module_name}{suffix}"
            if candidate.is_file():
                return candidate
        return None

    def get(self, module_name: str) -> Optional[ModuleType]:
        if module_name in self._cache:
            return self._cache[module_name]
        source = self._find_loader_file(module_name)
        if source is None:
            self._cache[module_name] = None
            return None
        temp_dir = self._ensure_temp_dir()
        dest = temp_dir / source.name
        if not dest.exists():
            shutil.copyfile(source, dest)
        try:
            module = importlib.import_module(module_name)
        except ImportError:
            self._cache[module_name] = None
            return None
        self._cache[module_name] = module
        return module
