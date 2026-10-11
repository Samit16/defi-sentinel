"""Unit tests for the DeFiSentinel log parser.

Validates extraction of SENTINEL_RESULT lines from realistic Foundry outputs,
wei-to-ETH conversion accuracy, and error handling for malformed logs.
"""

import pytest
from orchestrator.parser import parse_sentinel_line, parse_forge_output


SAMPLE_FORGE_OUTPUT_VULNERABLE = """
Compiling 31 files with Solc 0.8.20
Solc 0.8.20 finished in 1.45s
Compiler run successful!

Ran 1 test for contracts/attacks/Reentrancy.t.sol:ReentrancyTest
[PASS] test_reentrancy() (gas: 872076)
Logs:
  SENTINEL_RESULT|reentrancy|vulnerable|SUCCEEDED|10000000000000000000|drained vault via reentrant withdraw

Suite result: ok. 1 passed; 0 failed; 0 skipped; finished in 1.25ms (400.00µs CPU time)
Ran 1 test suite in 4.10ms: 1 tests passed, 0 failed, 0 skipped
"""

SAMPLE_FORGE_OUTPUT_PROTECTED = """
No files changed, compilation skipped

Ran 1 test for contracts/attacks/Reentrancy.t.sol:ReentrancyTest
[PASS] test_reentrancy() (gas: 808949)
Logs:
  SENTINEL_RESULT|reentrancy|protected|FAILED|0|reentrancy blocked: Initial withdraw failed

Suite result: ok. 1 passed; 0 failed; 0 skipped; finished in 810.00µs (290.00µs CPU time)
Ran 1 test suite in 3.70ms: 1 tests passed, 0 failed, 0 skipped
"""

SAMPLE_FORGE_OUTPUT_FLASH_LOAN = """
Ran 1 test for contracts/attacks/FlashLoan.t.sol:FlashLoanTest
[PASS] test_flash_loan() (gas: 1887362)
Logs:
  SENTINEL_RESULT|flash_loan|vulnerable|SUCCEEDED|154009453793169941471|drained lending pool via flash loan AMM pump and repaid lender

Suite result: ok. 1 passed; 0 failed; 0 skipped; finished in 2.50ms
"""

SAMPLE_FORGE_OUTPUT_NO_MARKER = """
Compiler run successful!
Ran 1 test for contracts/attacks/Broken.t.sol:BrokenTest
[PASS] test_broken() (gas: 1000)
Suite result: ok. 1 passed; 0 failed
"""


def test_parse_sentinel_line_succeeded():
    line = "SENTINEL_RESULT|reentrancy|vulnerable|SUCCEEDED|10000000000000000000|drained vault via reentrant withdraw"
    result = parse_sentinel_line(line, duration_s=1.23)

    assert result["module"] == "reentrancy"
    assert result["variant"] == "vulnerable"
    assert result["status"] == "SUCCEEDED"
    assert result["profit_eth"] == 10.0
    assert result["note"] == "drained vault via reentrant withdraw"
    assert result["duration_s"] == 1.23


def test_parse_sentinel_line_failed():
    line = "SENTINEL_RESULT|reentrancy|protected|FAILED|0|reentrancy blocked: Initial withdraw failed"
    result = parse_sentinel_line(line, duration_s=0.45)

    assert result["module"] == "reentrancy"
    assert result["variant"] == "protected"
    assert result["status"] == "FAILED"
    assert result["profit_eth"] == 0.0
    assert result["note"] == "reentrancy blocked: Initial withdraw failed"
    assert result["duration_s"] == 0.45


def test_parse_sentinel_line_invalid_format():
    with pytest.raises(ValueError, match="does not match SENTINEL_RESULT pattern"):
        parse_sentinel_line("MALFORMED_LINE|foo|bar")


def test_parse_forge_output_vulnerable():
    result = parse_forge_output(SAMPLE_FORGE_OUTPUT_VULNERABLE, duration_s=1.45)
    assert result["module"] == "reentrancy"
    assert result["variant"] == "vulnerable"
    assert result["status"] == "SUCCEEDED"
    assert result["profit_eth"] == 10.0
    assert "drained vault" in result["note"]


def test_parse_forge_output_protected():
    result = parse_forge_output(SAMPLE_FORGE_OUTPUT_PROTECTED, duration_s=0.81)
    assert result["module"] == "reentrancy"
    assert result["variant"] == "protected"
    assert result["status"] == "FAILED"
    assert result["profit_eth"] == 0.0
    assert "reentrancy blocked" in result["note"]


def test_parse_forge_output_flash_loan_fractional_eth():
    result = parse_forge_output(SAMPLE_FORGE_OUTPUT_FLASH_LOAN, duration_s=2.5)
    assert result["module"] == "flash_loan"
    assert result["variant"] == "vulnerable"
    assert result["status"] == "SUCCEEDED"
    # 154009453793169941471 wei is ~ 154.009454 ETH
    assert pytest.approx(result["profit_eth"], rel=1e-5) == 154.009454


def test_parse_forge_output_missing_marker():
    with pytest.raises(ValueError, match="No SENTINEL_RESULT marker found"):
        parse_forge_output(SAMPLE_FORGE_OUTPUT_NO_MARKER)
