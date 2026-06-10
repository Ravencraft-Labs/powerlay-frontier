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
            / "build",
        ]
    return [
        Path("C:/CCP/EVE Frontier") / build,
        Path("D:/CCP/EVE Frontier") / build,
        Path("C:/Games/EVE Frontier") / build,
        Path(os.environ.get("APPDATA", "C:/")) / "CCP" / "EVE Frontier" / build,
        # Common install roots where stillness/ sits directly under the game dir
        Path("D:/EVE Frontier"),
        Path("C:/EVE Frontier"),
        Path("D:/Games/EVE Frontier"),
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
        # Windows layout has a stillness/ subdir with resfileindex.txt + bin64.
        # macOS layout: candidate itself contains resfileindex.txt + bin64.
        if (candidate / "stillness" / "resfileindex.txt").is_file():
            stillness_dir = candidate / "stillness"
        elif (candidate / "resfileindex.txt").is_file():
            stillness_dir = candidate
        else:
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
