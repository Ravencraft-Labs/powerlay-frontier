"""Localization pickle access: maps message IDs to display strings.

The client ships `res:/localizationfsd/localization_fsd_<lang>.pickle` —
a `(language, {id: (text, plural?, params?)})` tuple. We expose:

- `load_localization(client, language)` -> dict[int, str] of resolved strings
- `Localizer` class wrapping that map with a `.get(id)` accessor and fallback
"""

from __future__ import annotations

import pickle
from dataclasses import dataclass
from typing import Dict

from extract.resindex import parse_resindex
from extract.types import ClientRoot


def _resource_path(language: str) -> str:
    return f"res:/localizationfsd/localization_fsd_{language}.pickle"


def load_localization(client: ClientRoot, language: str = "en-us") -> Dict[int, str]:
    """Read the localization pickle and return id -> text mapping."""
    index = parse_resindex(client.stillness_dir / "resfileindex.txt")
    res_path = _resource_path(language)
    if res_path not in index:
        return {}
    physical = index.resolve(res_path, client.resfiles_dir)
    raw = pickle.loads(physical.read_bytes())
    # Format: (lang_tag, {id: (text, plural?, params?)})
    if not isinstance(raw, tuple) or len(raw) != 2 or not isinstance(raw[1], dict):
        raise ValueError(
            f"unexpected localization pickle shape at {physical}: {type(raw).__name__}"
        )
    mapping: Dict[int, str] = {}
    for key, value in raw[1].items():
        if not isinstance(key, int):
            continue
        if isinstance(value, tuple) and value and isinstance(value[0], str):
            mapping[key] = value[0]
        elif isinstance(value, str):
            mapping[key] = value
    return mapping


@dataclass(frozen=True)
class Localizer:
    """Wraps an id->text map with a safe lookup that falls back to a sentinel."""

    mapping: Dict[int, str]
    language: str = "en-us"

    def get(self, message_id: int | None) -> str:
        if not isinstance(message_id, int):
            return ""
        text = self.mapping.get(message_id)
        if text is None:
            return ""
        return text

    def __len__(self) -> int:
        return len(self.mapping)
