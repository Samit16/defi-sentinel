"""Shared simulation engine used by the CLI (run.py) and the dashboard scan API.

Keeps the "run one module/variant and parse it" logic in a single place so the
CLI and the web API cannot drift apart.
"""

import shutil
import subprocess
from typing import Any, Dict

from orchestrator.config import MODULE_REGISTRY, PROJECT_ROOT
from orchestrator.parser import parse_forge_output
from orchestrator.runner import run_forge_test

BUILD_TIMEOUT_S = 300


def forge_available() -> bool:
    """True if the `forge` executable is on PATH."""
    return shutil.which("forge") is not None


def ensure_built(timeout_s: int = BUILD_TIMEOUT_S) -> None:
    """Compile the project once up-front.

    The first `forge test` on a clean checkout compiles everything, which can
    exceed the per-test timeout. Building first keeps that cost out of the
    per-module timings and gives a clear error if compilation fails.
    """
    try:
        proc = subprocess.run(
            ["forge", "build"],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "Foundry executable 'forge' not found. Please install Foundry and ensure it is on PATH."
        )
    except subprocess.TimeoutExpired:
        raise TimeoutError(f"'forge build' timed out after {timeout_s}s")
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip()
        raise RuntimeError(f"'forge build' failed:\n{detail}")


def run_single(
    module: str,
    variant: str,
    mode: str = "local",
    rpc_url: str = "",
    fork_block: str = "",
) -> Dict[str, Any]:
    """Run one attack module against one variant and return the parsed result.

    Raises ValueError for an unknown module, and propagates runner/parser errors.
    The returned result is cross-checked against the requested module/variant so
    that a stale or unrelated SENTINEL_RESULT line is never silently accepted.
    """
    if module not in MODULE_REGISTRY:
        raise ValueError(f"Unknown module: {module}")

    output, duration_s = run_forge_test(
        test_path=MODULE_REGISTRY[module],
        variant=variant,
        mode=mode,
        rpc_url=rpc_url,
        fork_block=fork_block,
    )
    result = parse_forge_output(output, duration_s=duration_s)

    if result["module"] != module or result["variant"] != variant:
        raise ValueError(
            f"Expected {module}/{variant} but forge reported "
            f"{result['module']}/{result['variant']}"
        )
    return result
