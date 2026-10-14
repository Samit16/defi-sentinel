"""End-to-end check against real Foundry. Skipped automatically when forge is absent.

Runs the cheapest module for both variants and asserts the core claim of the
project: the vulnerable target is exploited and the protected one blocks it.
"""

import pytest

from orchestrator.engine import forge_available, run_single

pytestmark = pytest.mark.skipif(not forge_available(), reason="Foundry (forge) not installed")


@pytest.mark.parametrize(
    "module,expected_profit_eth",
    [("reentrancy", 10.0), ("governance", 10.0)],
)
def test_vulnerable_is_exploited_and_protected_is_blocked(module, expected_profit_eth):
    vulnerable = run_single(module, "vulnerable")
    protected = run_single(module, "protected")

    assert vulnerable["status"] == "SUCCEEDED"
    assert vulnerable["profit_eth"] == pytest.approx(expected_profit_eth)
    assert protected["status"] == "FAILED"
    assert protected["profit_eth"] == 0
