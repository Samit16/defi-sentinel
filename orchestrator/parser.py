"""Parser for Foundry test execution logs.

Extracts standardized SENTINEL_RESULT lines using strict regular expressions
and normalizes numeric profit metrics from wei to ETH.
"""

import re
from typing import Dict, Any

# Strict regex matching: SENTINEL_RESULT|<module>|<variant>|<SUCCEEDED|FAILED>|<profit_wei>|<note>
SENTINEL_REGEX = re.compile(
    r"SENTINEL_RESULT\|(?P<module>[a-zA-Z0-9_]+)\|(?P<variant>[a-zA-Z0-9_]+)\|(?P<status>SUCCEEDED|FAILED)\|(?P<profit_wei>\d+)\|(?P<note>[^\r\n]*)"
)

WEI_PER_ETH = 10**18


def parse_sentinel_line(line: str, duration_s: float = 0.0) -> Dict[str, Any]:
    """Parses an individual line matching the SENTINEL_RESULT format."""
    match = SENTINEL_REGEX.search(line.strip())
    if not match:
        raise ValueError(f"Line does not match SENTINEL_RESULT pattern: {line}")

    module = match.group("module")
    variant = match.group("variant")
    status = match.group("status")
    profit_wei = int(match.group("profit_wei"))
    note = match.group("note").strip()

    profit_eth = float(profit_wei) / WEI_PER_ETH

    return {
        "module": module,
        "variant": variant,
        "status": status,
        "profit_eth": round(profit_eth, 6),
        "note": note,
        "duration_s": round(duration_s, 2),
    }


def parse_forge_output(output: str, duration_s: float = 0.0) -> Dict[str, Any]:
    """Scans forge execution output for the SENTINEL_RESULT line and extracts parsed result."""
    for line in output.splitlines():
        if "SENTINEL_RESULT|" in line:
            return parse_sentinel_line(line, duration_s)

    raise ValueError(
        "No SENTINEL_RESULT marker found in forge test output.\n"
        f"Captured output:\n{output}"
    )
