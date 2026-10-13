import pytest

from orchestrator.custom_run import validate_test_path
from orchestrator.parser import parse_forge_output


def test_custom_harness_path_accepts_existing_test():
    path = validate_test_path(
        "contracts/attacks/CustomHarnessExample.t.sol"
    )
    assert path == "contracts/attacks/CustomHarnessExample.t.sol"


@pytest.mark.parametrize(
    "path",
    [
        "README.md",
        "../README.md",
        "contracts/targets/VaultVulnerable.sol",
        "contracts/attacks/missing.t.sol",
    ],
)
def test_custom_harness_path_rejects_invalid_paths(path):
    with pytest.raises(ValueError):
        validate_test_path(path)


def test_result_parser_accepts_matching_marker():
    output = (
        "SENTINEL_RESULT|custom_reentrancy|vulnerable|"
        "SUCCEEDED|2000000000000000000|reentrancy extracted funds"
    )

    result = parse_forge_output(output, duration_s=0.25)

    assert result["module"] == "custom_reentrancy"
    assert result["variant"] == "vulnerable"
    assert result["status"] == "SUCCEEDED"
    assert result["profit_eth"] == 2.0


def test_result_parser_rejects_missing_marker():
    with pytest.raises(ValueError, match="No SENTINEL_RESULT marker"):
        parse_forge_output("Forge completed without a result marker")
