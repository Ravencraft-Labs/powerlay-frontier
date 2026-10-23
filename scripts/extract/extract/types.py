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
