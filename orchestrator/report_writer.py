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
) -> Dict[str, Any]:
    """Builds the report dictionary according to the frozen schema."""
    now = datetime.now(timezone.utc)
    report_id = now.strftime("%Y-%m-%dT%H-%M-%S")
    generated_at = now.isoformat()

    succeeded_count = sum(1 for r in results if r.get("status") == "SUCCEEDED")
    failed_count = sum(1 for r in results if r.get("status") == "FAILED")

    return {
        "report_id": report_id,
        "generated_at": generated_at,
        "mode": mode,
        "fork_block": int(fork_block) if fork_block not in (None, "") else None,
        "summary": {
            "total": len(results),
            "succeeded": succeeded_count,
            "failed": failed_count,
        },
        "results": results,
    }


def write_report(
    results: List[Dict[str, Any]],
    mode: str = "local",
    fork_block: Optional[int] = None,
) -> Path:
    """Serializes simulation results to reports/<report_id>.json and returns the path."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    report_data = generate_report_data(results, mode=mode, fork_block=fork_block)
    report_path = REPORTS_DIR / f"{report_data['report_id']}.json"

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    print(f"\n[+] Security simulation report written to: {report_path}")
    return report_path
