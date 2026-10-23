"""Report generator for DeFiSentinel simulations.

Constructs standardized JSON reports adhering to the frozen schema
and persists them to disk with timestamped filenames.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional
from orchestrator.config import REPORTS_DIR


def generate_report_data(
    results: List[Dict[str, Any]],
    mode: str = "local",
    fork_block: Optional[int] = None,
    target: Optional[str] = None,
    target_hash: Optional[str] = None,
    is_real: bool = True,
    compiler_warnings: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Builds the report dictionary according to the frozen schema with optional integrity metadata."""
    now = datetime.now(timezone.utc)
    report_id = now.strftime("%Y-%m-%dT%H-%M-%S")
    generated_at = now.isoformat()

    succeeded_count = sum(1 for r in results if r.get("status") == "SUCCEEDED")
    failed_count = sum(1 for r in results if r.get("status") == "FAILED")
    na_count = sum(1 for r in results if r.get("status") in ("NOT APPLICABLE", "SKIPPED"))

    summary: Dict[str, Any] = {
        "total": len(results),
        "succeeded": succeeded_count,
        "failed": failed_count,
    }
    if na_count > 0:
        summary["not_applicable"] = na_count

    data: Dict[str, Any] = {
        "report_id": report_id,
        "generated_at": generated_at,
        "mode": mode,
        "fork_block": int(fork_block) if fork_block not in (None, "") else None,
        "summary": summary,
        "results": results,
    }

    if target:
        data["target"] = target
    if target_hash:
        data["target_hash"] = target_hash
    data["is_real"] = is_real
    if compiler_warnings:
        data["compiler_warnings"] = compiler_warnings

    return data


def write_report(
    results: List[Dict[str, Any]],
    mode: str = "local",
    fork_block: Optional[int] = None,
    target: Optional[str] = None,
    target_hash: Optional[str] = None,
    is_real: bool = True,
    compiler_warnings: Optional[List[str]] = None,
) -> Path:
    """Serializes simulation results to reports/<report_id>.json and returns the path."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    report_data = generate_report_data(
        results,
        mode=mode,
        fork_block=fork_block,
        target=target,
        target_hash=target_hash,
        is_real=is_real,
        compiler_warnings=compiler_warnings,
    )
    report_path = REPORTS_DIR / f"{report_data['report_id']}.json"

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    print(f"\n[+] Security simulation report written to: {report_path}")
    return report_path
