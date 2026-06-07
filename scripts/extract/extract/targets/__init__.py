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
