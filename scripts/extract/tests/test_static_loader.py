"""static_loader tests — these only verify behavior we can mock.

The real `code.ccp` import is exercised by the targets that use it.
"""

from pathlib import Path

import pytest

from extract.static_loader import get_binary_loader
from extract.types import ClientRoot


def test_get_binary_loader_raises_when_code_ccp_missing(tmp_path: Path):
    stillness = tmp_path / "client" / "stillness"
    stillness.mkdir(parents=True)
    client = ClientRoot(
        build="stillness",
        server="x",
        root=tmp_path / "client",
        stillness_dir=stillness,
        resfiles_dir=tmp_path,
        bin_dir=None,
        platform="darwin",
    )
    with pytest.raises(FileNotFoundError, match="code.ccp not found"):
        get_binary_loader(client)
