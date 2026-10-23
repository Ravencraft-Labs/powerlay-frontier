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
