"""Subprocess runner for Foundry forge tests.

Constructs forge test commands with appropriate environment variables and flags,
handles timeouts, and verifies execution status.
"""

import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Tuple, Optional, Dict
from orchestrator.config import PROJECT_ROOT


def get_forge_binary() -> str:
    """Finds the forge executable on PATH or in standard user directories."""
    # First check PATH
    found = shutil.which("forge") or shutil.which("forge.exe")
    if found:
        return found

    # Check common Foundry installation directories on Windows / Unix
    candidates = [
        Path.home() / ".local" / "bin" / "forge.exe",
        Path.home() / ".local" / "bin" / "forge",
        Path.home() / ".foundry" / "bin" / "forge.exe",
        Path.home() / ".foundry" / "bin" / "forge",
        Path("C:/Users/samit/Downloads/foundry_nightly_win32_amd64/forge.exe"),
    ]
    for c in candidates:
        if c.is_file() and os.access(c, os.X_OK):
            return str(c)

    return "forge"


def run_forge_test(
    test_path: str,
    variant: str = "vulnerable",
    mode: str = "local",
    rpc_url: str = "",
    fork_block: str = "",
    timeout_s: int = 60,
    extra_env: Optional[Dict[str, str]] = None,
) -> Tuple[str, float]:
    """Runs a single forge test file for a specific target variant.

    Args:
        test_path: Relative path to the .t.sol file from project root.
        variant: "vulnerable" or "protected" (or "uploaded").
        mode: "local" or "fork".
        rpc_url: Optional RPC endpoint used when mode is "fork".
        fork_block: Optional fork block number.
        timeout_s: Maximum execution duration before timing out.
        extra_env: Optional extra environment variables to inject.

    Returns:
        Tuple of (stdout text, duration in seconds).
    """
    forge_bin = get_forge_binary()
    cmd = [forge_bin, "test", "--match-path", test_path, "-vv"]

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
    env["FOUNDRY_DISABLE_NIGHTLY_WARNING"] = "1"
    if extra_env:
        env.update(extra_env)

    start_time = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(PROJECT_ROOT),
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_s,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "Foundry executable 'forge' not found. Please install Foundry and ensure it is on PATH."
        )
    except subprocess.TimeoutExpired:
        raise TimeoutError(f"Forge test timed out after {timeout_s}s: {' '.join(cmd)}")

    duration_s = time.time() - start_time

    # Combine stdout + stderr for full output
    combined = (proc.stdout or "") + "\n" + (proc.stderr or "")

    # If forge exited with an error, check if we still got useful SENTINEL_RESULT output.
    # forge test returns non-zero when tests revert, but our Solidity try/catch
    # harness may still have emitted valid SENTINEL_RESULT markers before the failure.
    if proc.returncode != 0:
        if "SENTINEL_RESULT|" in combined:
            # We have parseable results despite non-zero exit — return them
            return combined, duration_s
        err_msg = proc.stderr.strip() if proc.stderr else proc.stdout.strip()
        raise RuntimeError(
            f"Forge test command failed with code {proc.returncode}:\n{err_msg}"
        )

    # Return combined output (forge test prints console.log to stdout)
    return combined, duration_s
