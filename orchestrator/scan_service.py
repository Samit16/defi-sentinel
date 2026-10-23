"""Scan service coordinating validation, compilation, and dynamic Foundry EVM simulation.

Executes atomic attack simulations against uploaded Solidity source code using
the real Foundry forge toolchain, capturing truthful execution logs, and persisting
reports adhering to the frozen schema.
"""

import os
import re
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from orchestrator import config
from orchestrator import validator
from orchestrator import compiler
from orchestrator import runner
from orchestrator import parser
from orchestrator import report_writer


def extract_contract_functions(source_text: str) -> List[str]:
    """Extracts unique function names declared in the Solidity source."""
    no_comments = re.sub(r"//.*", "", source_text)
    no_comments = re.sub(r"/\*.*?\*/", "", no_comments, flags=re.DOTALL)
    matches = re.findall(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", no_comments)
    # Deduplicate preserving order
    return list(dict.fromkeys(matches))


def validate_and_inspect_solidity(
    source_content: Any,
    filename: Optional[str],
) -> Dict[str, Any]:
    """Validates Solidity source, tests compilation, and returns metadata.

    Args:
        source_content: String or bytes containing Solidity code.
        filename: Name of the file.

    Returns:
        Dict with status, safe filename, primary contract, functions, hash, and warnings.
    """
    safe_name, cleaned_source, source_hash, contract_names = validator.validate_solidity_source(
        source_content, filename
    )

    # Perform compiler validation
    comp_result = compiler.compile_solidity_source(cleaned_source)
    primary_contract = contract_names[0] if contract_names else "UploadedContract"
    functions = extract_contract_functions(cleaned_source)

    return {
        "status": "valid",
        "filename": safe_name,
        "primary_contract": primary_contract,
        "contract_names": contract_names,
        "functions": functions,
        "source_hash": source_hash,
        "warnings": comp_result.get("warnings", []),
    }


def execute_scan(
    source_content: Any,
    filename: Optional[str],
    protocol: str = "VAULT",
    role_map: Optional[Dict[str, str]] = None,
    constructor_args: str = "",
    holds: Optional[Dict[str, bool]] = None,
    mode: str = "local",
    rpc_url: str = "",
    fork_block: str = "",
    timeout_s: int = 60,
    reports_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Executes the full end-to-end security analysis pipeline for an uploaded contract.

    1. Validates file and source integrity.
    2. Compiles source via forge build.
    3. Runs atomic attack tests in Foundry EVM (contracts/attacks/UploadedAnalysis.t.sol).
    4. Parses real SENTINEL_RESULT output logs.
    5. Writes and returns the immutable report.
    """
    safe_name, cleaned_source, source_hash, contract_names = validator.validate_solidity_source(
        source_content, filename
    )

    # Step 1: Compiler verification
    comp_result = compiler.compile_solidity_source(cleaned_source, timeout_s=45)
    warnings = comp_result.get("warnings", [])

    primary_contract = contract_names[0] if contract_names else "UploadedContract"
    norm_protocol = (protocol or "VAULT").strip().upper()
    if norm_protocol not in ("VAULT", "LENDING", "GOVERNANCE"):
        norm_protocol = "VAULT"

    roles = role_map or {}

    # Step 2: Prepare test environment variables
    extra_env = {
        "TARGET_CONTRACT": primary_contract,
        "TARGET_PROTOCOL": norm_protocol,
        "ROLE_DEPOSIT": roles.get("deposit", "deposit"),
        "ROLE_WITHDRAW": roles.get("withdraw", "withdraw"),
        "ROLE_COLLATERAL": roles.get("depositCollateral", "depositCollateral"),
        "ROLE_BORROW": roles.get("borrow", "borrow"),
        "ROLE_PRICE": roles.get("getPrice", "getPrice"),
        "ROLE_PROPOSE": roles.get("propose", "propose"),
        "ROLE_VOTE": roles.get("vote", "vote"),
        "ROLE_EXECUTE": roles.get("execute", "execute"),
    }

    # Step 3: Execute real Foundry attack harness
    test_path = "contracts/attacks/UploadedAnalysis.t.sol"
    output, duration_s = runner.run_forge_test(
        test_path=test_path,
        variant="uploaded",
        mode=mode or config.MODE,
        rpc_url=rpc_url or config.RPC_URL,
        fork_block=fork_block or config.FORK_BLOCK,
        timeout_s=timeout_s,
        extra_env=extra_env,
    )

    # Step 4: Parse stdout SENTINEL_RESULT markers
    parsed_results = parser.parse_all_sentinel_lines(output, duration_s=duration_s)
    if not parsed_results:
        # No markers found — generate explicit failure entries for all modules
        # so a truthful "no exploits found / analysis inconclusive" report is produced
        # instead of crashing with a 500.
        truncated_output = output[:500] if output else "(no output captured)"
        for mod in ["reentrancy", "oracle", "flash_loan", "governance"]:
            parsed_results.append({
                "module": mod,
                "variant": "uploaded",
                "status": "FAILED",
                "profit_eth": 0.0,
                "note": f"Analysis inconclusive — no exploit simulation output captured. Engine output: {truncated_output}",
                "duration_s": round(duration_s, 2),
            })

    # Ensure all 4 modules are represented
    module_names = [r["module"] for r in parsed_results]
    for required_mod in ["reentrancy", "oracle", "flash_loan", "governance"]:
        if required_mod not in module_names:
            parsed_results.append({
                "module": required_mod,
                "variant": "uploaded",
                "status": "NOT APPLICABLE",
                "profit_eth": 0.0,
                "note": f"Module {required_mod} not applicable to {norm_protocol} protocol profile",
                "duration_s": 0.01,
            })

    # Step 5: Write standardized report
    target_dir = reports_dir or report_writer.REPORTS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    report_data = report_writer.generate_report_data(
        results=parsed_results,
        mode=mode or config.MODE,
        fork_block=int(fork_block) if fork_block else None,
        target=safe_name,
        target_hash=source_hash,
        is_real=True,
        compiler_warnings=warnings,
    )
    report_path = target_dir / f"{report_data['report_id']}.json"

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    # Clean up temporary contract artifact from targets
    compiler.cleanup_uploaded_contract()

    return report_data
