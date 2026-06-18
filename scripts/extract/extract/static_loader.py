"""Access to the CCP Python FSD loader bundled in client's `code.ccp` archive.

`code.ccp` is a zip archive containing the pure-Python `fsd` package. We add
it to `sys.path` so `fsd.schemas.binaryLoader` becomes importable. Unlike the
native `.so` loaders, this code does not need `DYLD_LIBRARY_PATH` setup —
it's plain Python (.pyc) under `zipimport`.

Used by targets that read CCP's `.static` + `.schema` resource pairs.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Optional

from extract.types import ClientRoot

_CODE_CCP_INSERTED: dict[str, bool] = {}
_BINARY_LOADER: Any = None


def _ensure_ccp_on_path(code_ccp: Path) -> None:
    key = str(code_ccp)
    if _CODE_CCP_INSERTED.get(key):
        return
    sys.path.insert(0, str(code_ccp))
    _CODE_CCP_INSERTED[key] = True


def get_binary_loader(client: ClientRoot) -> Any:
    """Return the `fsd.schemas.binaryLoader` module from the client's code.ccp.

    Caches the imported module for the process lifetime.
    """
    global _BINARY_LOADER
    if _BINARY_LOADER is not None:
        return _BINARY_LOADER
    code_ccp = client.stillness_dir / "code.ccp"
    if not code_ccp.is_file():
        raise FileNotFoundError(
            f"code.ccp not found at {code_ccp} — cannot load fsd binary loader"
        )
    _ensure_ccp_on_path(code_ccp)
    import fsd.schemas.binaryLoader as bl  # type: ignore[import-not-found]
    _BINARY_LOADER = bl
    return bl


def load_static_with_schema(
    client: ClientRoot,
    static_file: Path,
    schema_file: Optional[Path],
) -> Any:
    """Decode a `.static` + `.schema` pair via the CCP binary loader.

    Returns the loader-native container (typically a DictLoader / ObjectLoader
    tree). Callers should walk it via the shared cfsd helpers (or via
    attribute access for ObjectLoader-style records).
    """
    bl = get_binary_loader(client)
    return bl.LoadFSDDataInPython(
        str(static_file),
        str(schema_file) if schema_file else None,
        False,
        None,
    )
