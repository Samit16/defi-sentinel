"""Solidity compilation and syntax verification via Foundry forge build.

Validates that uploaded Solidity contracts compile correctly against the project's
configured Solc compiler, distinguishing syntax/compiler failures from security findings.
"""

import os
import re
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional
from orchestrator.config import PROJECT_ROOT
from orchestrator.runner import get_forge_binary

UPLOADED_CONTRACT_PATH = PROJECT_ROOT / "contracts" / "targets" / "UploadedContract.sol"


class CompilationError(Exception):
    """Raised when Solidity compilation fails."""

    def __init__(self, message: str, details: str = "", raw_output: str = ""):
        super().__init__(message)
        self.message = message
        self.details = details
        self.raw_output = raw_output

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error": self.message,
            "code": "COMPILATION_FAILED",
            "status": "error",
            "details": self.details or self.message,
        }


def extract_clean_compiler_errors(output: str) -> str:
    """Extracts human-readable Solidity compiler errors from forge output."""
    error_lines = []
    lines = output.splitlines()
    capturing = False

    for line in lines:
        stripped = line.strip()
        # Look for standard Solc error prefixes
        if any(err_type in stripped for err_type in ["Error (", "ParserError:", "TypeError:", "DeclarationError:", "SyntaxError:"]):
            capturing = True
            error_lines.append(stripped)
        elif capturing:
            if stripped.startswith("warning[") or stripped.startswith("Warning:") or stripped.startswith("Compiler run"):
                capturing = False
            elif stripped:
                error_lines.append(stripped)
            if len(error_lines) >= 12:
                break

    if error_lines:
        return "\n".join(error_lines[:10])

    # Fallback to general error capture
    clean_lines = [
        l.strip() for l in lines
        if "error" in l.lower() and not l.strip().startswith("Warning") and "nightly" not in l.lower()
    ]
    return "\n".join(clean_lines[:8]) if clean_lines else output.strip()[:500]


def compile_solidity_source(source_text: str, timeout_s: int = 45) -> Dict[str, Any]:
    """Writes source to contracts/targets/UploadedContract.sol and executes forge build.

    Args:
        source_text: Cleaned Solidity source code.
        timeout_s: Subprocess timeout in seconds.

    Returns:
        Dict containing { "success": True, "warnings": [...] }

    Raises:
        CompilationError: If forge build exits with non-zero return code.
        RuntimeError: If forge binary is missing.
    """
    UPLOADED_CONTRACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(UPLOADED_CONTRACT_PATH, "w", encoding="utf-8") as f:
        f.write(source_text)

    forge_bin = get_forge_binary()
    env = os.environ.copy()
    env["FOUNDRY_DISABLE_NIGHTLY_WARNING"] = "1"

    cmd = [forge_bin, "build"]

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
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Foundry executable 'forge' not found. Please ensure Foundry is installed."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise CompilationError(
            "Solidity compilation timed out.",
            details=f"forge build exceeded {timeout_s}s timeout limit.",
        ) from exc

    combined_output = (proc.stderr or "") + "\n" + (proc.stdout or "")

    if proc.returncode != 0:
        clean_err = extract_clean_compiler_errors(combined_output)
        # Clean up failed contract so subsequent builds aren't blocked
        if UPLOADED_CONTRACT_PATH.exists():
            try:
                UPLOADED_CONTRACT_PATH.unlink()
            except OSError:
                pass
        raise CompilationError(
            message="Solidity compilation failed.",
            details=clean_err,
            raw_output=combined_output,
        )

    # Collect static analysis warnings
    warnings = []
    for line in combined_output.splitlines():
        if line.strip().startswith("warning["):
            warnings.append(line.strip())

    return {
        "success": True,
        "warnings": warnings,
    }


def cleanup_uploaded_contract():
    """Removes temporary UploadedContract.sol if it exists."""
    if UPLOADED_CONTRACT_PATH.exists():
        try:
            UPLOADED_CONTRACT_PATH.unlink()
        except OSError:
            pass
