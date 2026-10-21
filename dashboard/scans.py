"""Target upload and scan endpoints for the DeFiSentinel dashboard API.

Endpoints (registered on the Flask app by dashboard/serve.py):

    POST /api/targets        store an uploaded .sol file, returns a target_id
    POST /api/scans          start a background scan, returns a scan_id (202)
    GET  /api/scans/<id>     poll scan progress and, once finished, the report id

Scope note: a scan runs the attack suites registered in
orchestrator.config.MODULE_REGISTRY through the same forge runner, parser and
report writer as the CLI. An uploaded target is validated and stored, but no
attack harness is generated for it yet, so scan responses report
"target_analyzed": false.
"""

import hashlib
import re
import threading
import time
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from orchestrator.config import (
    DEFAULT_MODULES,
    DEFAULT_VARIANTS,
    FORK_BLOCK as CONFIG_FORK_BLOCK,
    MODE as CONFIG_MODE,
    MODULE_REGISTRY,
    PROJECT_ROOT,
    RPC_URL as CONFIG_RPC_URL,
)
from orchestrator.parser import parse_forge_output
from orchestrator.report_writer import write_report
from orchestrator.runner import run_forge_test

scans_bp = Blueprint("scans", __name__)

# "cache/" is already in .gitignore, and forge does not compile it
# (foundry.toml sets src = "contracts").
UPLOAD_DIR = PROJECT_ROOT / "cache" / "dashboard_uploads"
MAX_SOURCE_BYTES = 100 * 1024
MAX_JOBS_KEPT = 50
MAX_ERROR_CHARS = 2000
FILENAME_RE = re.compile(r"[A-Za-z0-9_-]{1,64}\.sol")
VALID_VARIANTS = ("vulnerable", "protected")

_lock = threading.Lock()
_targets = {}
_jobs = {}
_job_order = []


def _error(message, status):
    return jsonify({"error": message}), status


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# --- targets ---------------------------------------------------------------

@scans_bp.route("/api/targets", methods=["POST"])
def create_target():
    """Validates and stores an uploaded Solidity source file."""
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return _error("Request body must be a JSON object", 400)

    filename = body.get("filename")
    source = body.get("source")

    if not isinstance(filename, str) or not FILENAME_RE.fullmatch(filename):
        return _error(
            "filename must be a plain .sol file name "
            "(letters, digits, _ or - only)",
            400,
        )
    if not isinstance(source, str) or not source.strip():
        return _error("source is required", 400)

    raw = source.encode("utf-8")
    if len(raw) > MAX_SOURCE_BYTES:
        return _error(f"source exceeds {MAX_SOURCE_BYTES // 1024} KB limit", 413)
    if not re.search(r"^\s*pragma\s+solidity\b", source, re.MULTILINE):
        return _error("source must contain a 'pragma solidity' line", 400)
    if not re.search(
        r"^\s*(abstract\s+contract|contract|library|interface)\s+\w+",
        source,
        re.MULTILINE,
    ):
        return _error("source must declare a contract, library or interface", 400)

    target_id = f"tgt-{uuid.uuid4().hex[:8]}"
    folder = UPLOAD_DIR / target_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / filename).write_bytes(raw)

    record = {
        "target_id": target_id,
        "filename": filename,
        "size_bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "created_at": _now_iso(),
    }
    with _lock:
        _targets[target_id] = record
    return jsonify(record), 201


# --- scan request validation -------------------------------------------------

def _parse_modules(value):
    if value is None or (isinstance(value, str) and value.strip().lower() == "all"):
        return list(DEFAULT_MODULES)
    if isinstance(value, str):
        value = value.split(",")
    if not isinstance(value, list) or not value:
        raise ValueError("modules must be 'all' or a non-empty list of module ids")

    modules = []
    for item in value:
        if not isinstance(item, str):
            raise ValueError("modules must be strings")
        name = item.strip().lower()
        if name not in MODULE_REGISTRY:
            raise ValueError(
                f"Unknown module '{name}'. "
                f"Available: {', '.join(MODULE_REGISTRY)}"
            )
        if name not in modules:
            modules.append(name)
    return modules


def _parse_variants(value):
    if value is None or value == "both":
        return list(DEFAULT_VARIANTS)
    if value in VALID_VARIANTS:
        return [value]
    raise ValueError("variant must be 'vulnerable', 'protected' or 'both'")


def _parse_mode(body):
    mode = body.get("mode", CONFIG_MODE)
    if not isinstance(mode, str) or mode.lower() not in ("local", "fork"):
        raise ValueError("mode must be 'local' or 'fork'")
    mode = mode.lower()

    if mode == "local":
        return mode, ""

    # The RPC URL only ever comes from .env, never from the request body.
    if not CONFIG_RPC_URL:
        raise ValueError("Fork mode requires RPC_URL to be set in .env")
    fork_block = str(body.get("fork_block", CONFIG_FORK_BLOCK) or "").strip()
    if fork_block and not fork_block.isdigit():
        raise ValueError("fork_block must be a non-negative integer")
    return mode, fork_block


# --- scan jobs ---------------------------------------------------------------

def _snapshot(job):
    """Returns a JSON-safe copy of a job. Caller must hold _lock."""
    now = time.time()
    rows = []
    for row in job["rows"]:
        public = {k: v for k, v in row.items() if not k.startswith("_")}
        if row["state"] == "RUNNING":
            public["elapsed_s"] = round(now - row["_started"], 2)
        rows.append(public)

    total_steps = len(job["rows"]) * len(job["variants"])
    steps_done = sum(row["_done"] for row in job["rows"])
    if job["status"] in ("done", "failed"):
        overall = 100
    else:
        overall = int(steps_done * 100 / total_steps) if total_steps else 0

    started = job["_started"]
    finished = job["_finished"]
    if started is None:
        elapsed = 0.0
    else:
        elapsed = round((finished or now) - started, 2)

    return {
        "scan_id": job["scan_id"],
        "status": job["status"],
        "created_at": job["created_at"],
        "mode": job["mode"],
        "fork_block": job["fork_block"] or None,
        "variants": list(job["variants"]),
        "modules": list(job["modules"]),
        "target_id": job["target_id"],
        "target_analyzed": False,
        "note": (
            "Runs the bundled attack suites. The uploaded target is stored "
            "but no harness is generated for it yet."
        ),
        "overall": overall,
        "elapsed_s": elapsed,
        "rows": rows,
        "results": [dict(r) for r in job["results"]],
        "errors": [dict(e) for e in job["errors"]],
        "report_id": job["report_id"],
    }


def _run_job(scan_id):
    """Worker thread: runs each module/variant and writes one report."""
    with _lock:
        job = _jobs[scan_id]
        job["status"] = "running"
        job["_started"] = time.time()

    try:
        for row in job["rows"]:
            module = row["module"]
            with _lock:
                row["state"] = "RUNNING"
                row["_started"] = time.time()

            for variant in job["variants"]:
                try:
                    output, duration_s = run_forge_test(
                        test_path=MODULE_REGISTRY[module],
                        variant=variant,
                        mode=job["mode"],
                        rpc_url=CONFIG_RPC_URL if job["mode"] == "fork" else "",
                        fork_block=job["fork_block"],
                    )
                    result = parse_forge_output(output, duration_s=duration_s)
                    if result["module"] != module or result["variant"] != variant:
                        raise ValueError(
                            f"Expected {module}/{variant} result marker, "
                            f"got {result['module']}/{result['variant']}"
                        )
                    with _lock:
                        job["results"].append(result)
                except Exception as exc:
                    with _lock:
                        job["errors"].append({
                            "module": module,
                            "variant": variant,
                            "error": str(exc)[:MAX_ERROR_CHARS],
                        })
                finally:
                    with _lock:
                        row["_done"] += 1
                        row["progress"] = int(
                            row["_done"] * 100 / len(job["variants"])
                        )

            with _lock:
                had_error = any(e["module"] == module for e in job["errors"])
                row["state"] = "ERROR" if had_error else "DONE"
                row["elapsed_s"] = round(time.time() - row["_started"], 2)
                row["duration_s"] = row["elapsed_s"]

        if job["results"]:
            report_path = write_report(
                results=list(job["results"]),
                mode=job["mode"],
                fork_block=job["fork_block"] or None,
            )
            with _lock:
                job["report_id"] = report_path.stem
                job["status"] = "done"
        else:
            with _lock:
                job["status"] = "failed"
    except Exception as exc:
        with _lock:
            job["errors"].append({
                "module": None,
                "variant": None,
                "error": f"Scan aborted: {str(exc)[:MAX_ERROR_CHARS]}",
            })
            job["status"] = "failed"
    finally:
        with _lock:
            job["_finished"] = time.time()


@scans_bp.route("/api/scans", methods=["POST"])
def create_scan():
    """Starts a background scan. Only one scan may run at a time."""
    body = request.get_json(silent=True)
    if body is None:
        body = {}
    if not isinstance(body, dict):
        return _error("Request body must be a JSON object", 400)

    try:
        modules = _parse_modules(body.get("modules"))
        variants = _parse_variants(body.get("variant"))
        mode, fork_block = _parse_mode(body)
    except ValueError as exc:
        return _error(str(exc), 400)

    target_id = body.get("target_id")
    if target_id is not None:
        if not isinstance(target_id, str):
            return _error("target_id must be a string", 400)
        with _lock:
            if target_id not in _targets:
                return _error(f"Target '{target_id}' not found", 404)

    scan_id = f"scan-{uuid.uuid4().hex[:8]}"
    job = {
        "scan_id": scan_id,
        "status": "queued",
        "created_at": _now_iso(),
        "mode": mode,
        "fork_block": fork_block,
        "variants": variants,
        "modules": modules,
        "target_id": target_id,
        "rows": [
            {
                "module": m,
                "state": "QUEUED",
                "progress": 0,
                "elapsed_s": 0.0,
                "duration_s": 0.0,
                "_done": 0,
                "_started": None,
            }
            for m in modules
        ],
        "results": [],
        "errors": [],
        "report_id": None,
        "_started": None,
        "_finished": None,
    }

    with _lock:
        active = next(
            (j for j in _jobs.values() if j["status"] in ("queued", "running")),
            None,
        )
        if active is not None:
            return _error(
                f"Scan '{active['scan_id']}' is already running; "
                "wait for it to finish",
                409,
            )
        _jobs[scan_id] = job
        _job_order.append(scan_id)
        while len(_job_order) > MAX_JOBS_KEPT:
            _jobs.pop(_job_order.pop(0), None)
        snapshot = _snapshot(job)

    threading.Thread(target=_run_job, args=(scan_id,), daemon=True).start()
    return jsonify(snapshot), 202


@scans_bp.route("/api/scans/<scan_id>", methods=["GET"])
def get_scan(scan_id):
    """Returns the current state of a scan."""
    with _lock:
        job = _jobs.get(scan_id)
        if job is None:
            return _error(f"Scan '{scan_id}' not found", 404)
        return jsonify(_snapshot(job))