"""Target registry sort and lookup tests."""

import pytest

from extract.targets import (
    TargetProtocol,
    register_target,
    registry_snapshot,
    topological_order,
    _CLEAR_FOR_TESTS,
)


class _FakeTarget:
    NAME = "fake"
    REQUIRED_RESOURCES: list[str] = []
    OPTIONAL_RESOURCES: list[str] = []
    OUTPUT_FILENAME = "fake.json"
    DEPENDS_ON: list[str] = []


def _make_target(name: str, depends_on: list[str]) -> TargetProtocol:
    t = _FakeTarget()
    t.NAME = name  # type: ignore[misc]
    t.DEPENDS_ON = depends_on  # type: ignore[misc]
    t.OUTPUT_FILENAME = f"{name}.json"  # type: ignore[misc]
    return t  # type: ignore[return-value]


@pytest.fixture(autouse=True)
def _reset_registry():
    _CLEAR_FOR_TESTS()
    yield
    _CLEAR_FOR_TESTS()


def test_register_and_lookup():
    register_target(_make_target("a", []))
    snapshot = registry_snapshot()
    assert "a" in snapshot


def test_topological_order_respects_dependencies():
    register_target(_make_target("a", []))
    register_target(_make_target("b", ["a"]))
    register_target(_make_target("c", ["b"]))
    order = [t.NAME for t in topological_order()]
    assert order.index("a") < order.index("b") < order.index("c")


def test_topological_order_detects_cycle():
    register_target(_make_target("x", ["y"]))
    register_target(_make_target("y", ["x"]))
    with pytest.raises(ValueError, match="cycle"):
        topological_order()


def test_register_rejects_duplicate():
    register_target(_make_target("a", []))
    with pytest.raises(ValueError, match="already registered"):
        register_target(_make_target("a", []))
