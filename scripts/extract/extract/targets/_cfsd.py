"""Shared helpers for translating CCP cfsd container objects to plain Python.

CCP loader modules expose records and collections backed by `cfsd.list` /
`cfsd.dict` / record types. These aren't subclasses of list/dict, so
`json.dumps` rejects them. `_normalize` and `_record_to_dict` perform a
recursive conversion suitable for any fsdbinary loader output we touch.
"""

from __future__ import annotations

from typing import Any, Dict


def normalize(value: Any) -> Any:
    """Recursively convert CCP cfsd containers to JSON-friendly Python types.

    Primitives pass through. cfsd.list/cfsd.dict are detected by their type
    module + name. Records (attribute-only objects) fall through to
    record_to_dict.
    """
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    if isinstance(value, (list, tuple)):
        return [normalize(v) for v in value]
    if isinstance(value, dict):
        return {str(k): normalize(v) for k, v in value.items()}
    type_name = type(value).__name__
    module_name = type(value).__module__
    if module_name == "cfsd" and type_name == "list":
        return [normalize(v) for v in value]
    if module_name == "cfsd" and type_name == "dict":
        return {str(k): normalize(value[k]) for k in value}
    try:
        return [normalize(v) for v in iter(value)]
    except TypeError:
        pass
    return record_to_dict(value)


def record_to_dict(rec: Any) -> Dict[str, Any]:
    """Translate a CCP cfsd record (attribute access) to a plain dict.

    Field set varies per record — enumerate via dir() and skip dunders /
    callables.
    """
    out: Dict[str, Any] = {}
    for name in dir(rec):
        if name.startswith("_"):
            continue
        try:
            value = getattr(rec, name)
        except AttributeError:
            continue
        if callable(value):
            continue
        out[name] = normalize(value)
    return out
