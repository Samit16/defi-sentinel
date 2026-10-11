"""Subprocess runner for Foundry forge tests.

Constructs forge test commands with appropriate environment variables and flags,
handles timeouts, and verifies execution status.
"""

import os
import subprocess
import time
from typing import Tuple
from orchestrator.config import PROJECT_ROOT


def run_forge_test(
    test_path: str,
    variant: str,
    mode: str = "local",
    rpc_url: str = "",
    fork_block: str = "",
    timeout_s: int = 60,
) -> Tuple[str, float]:
    """Runs a single forge test file for a specific target variant.

    Args:
        test_path: Relative path to the .t.sol file from project root.
        variant: "vulnerable" or "protected".
        mode: "local" or "fork".
        rpc_url: Optional RPC endpoint used when mode is "fork".
        fork_block: Optional fork block number.
        timeout_s: Maximum execution duration before timing out.

    Returns:
        Tuple of (stdout text, duration in seconds).
    """
    cmd = ["forge", "test", "--match-path", test_path, "-vv"]

    if mode == "fork":
        if not rpc_url:
            raise ValueError(
                "Fork mode requires an RPC URL. Please set RPC_URL in .env or provide --rpc-url."
            )
        cmd.extend(["--fork-url", rpc_url])
        if fork_block:
            cmd.extend(["--fork-block-number", str(fork_block)])

    # Propagate current environment and inject VARIANT
    env = os.environ.copy()
    env["VARIANT"] = variant

    start_time = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(PROJECT_ROOT),
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "Foundry executable 'forge' not found. Please install Foundry and ensure it is on PATH."
        )
    except subprocess.TimeoutExpired:
        raise TimeoutError(f"Forge test timed out after {timeout_s}s: {' '.join(cmd)}")

    duration_s = time.time() - start_time

    # If forge exited with an error (e.g. compilation error or syntax issue)
    if proc.returncode != 0:
        err_msg = proc.stderr.strip() if proc.stderr else proc.stdout.strip()
        raise RuntimeError(
            f"Forge test command failed with code {proc.returncode}:\n{err_msg}"
        )

    # Return stdout (forge test prints console.log to stdout)
    output = proc.stdout if proc.stdout else proc.stderr
    return output, duration_s
