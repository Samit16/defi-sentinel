"""Flask web server for the DeFiSentinel security simulation dashboard.

Serves static UI assets and provides REST endpoints for listing and viewing reports.
"""

import json
import sys
from pathlib import Path

# Allow `python dashboard/serve.py` (script mode) to import the sibling `orchestrator` package.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from flask import Flask, jsonify, render_template, abort, request  # noqa: E402

from orchestrator import config as engine_config  # noqa: E402
from orchestrator.engine import forge_available  # noqa: E402
from orchestrator.scan_manager import ScanBusyError, manager as scan_manager  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = PROJECT_ROOT / "reports"
SAMPLE_REPORT_FILE = REPORTS_DIR / "sample_report.json"

app = Flask(
    __name__,
    template_folder=str(Path(__file__).resolve().parent / "templates"),
    static_folder=str(Path(__file__).resolve().parent / "static"),
)


@app.errorhandler(404)
def handle_not_found(e):
    """Returns JSON (instead of Flask's default HTML page) for 404s on API routes."""
    if request.path.startswith("/api/"):
        return jsonify({"error": getattr(e, "description", "Not found")}), 404
    return e


@app.errorhandler(500)
def handle_server_error(e):
    """Returns JSON (instead of Flask's default HTML page) for 500s on API routes."""
    if request.path.startswith("/api/"):
        return jsonify({"error": getattr(e, "description", "Internal server error")}), 500
    return e


def get_available_reports():
    """Returns sorted list of reports on disk, with sample fallback if empty."""
    if not REPORTS_DIR.exists():
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    report_files = [
        f for f in REPORTS_DIR.glob("*.json") if f.name != "sample_report.json"
    ]
    report_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)

    summaries = []
    for p in report_files:
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
                summaries.append({
                    "id": data.get("report_id", p.stem),
                    "filename": p.name,
                    "generated_at": data.get("generated_at"),
                    "mode": data.get("mode", "local"),
                    "summary": data.get("summary", {}),
                    "is_sample": False,
                })
        except Exception:
            continue

    if not summaries and SAMPLE_REPORT_FILE.exists():
        try:
            with open(SAMPLE_REPORT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                summaries.append({
                    "id": data.get("report_id", "sample_report"),
                    "filename": "sample_report.json",
                    "generated_at": data.get("generated_at"),
                    "mode": data.get("mode", "local"),
                    "summary": data.get("summary", {}),
                    "is_sample": True,
                })
        except Exception:
            pass

    return summaries


@app.route("/")
def index():
    """Renders the single-page dashboard."""
    return render_template("index.html")


@app.route("/api/health", methods=["GET"])
def health():
    """Lightweight liveness check for the dashboard API (useful for the demo script and deployment)."""
    return jsonify({
        "status": "ok",
        "reports_dir_exists": REPORTS_DIR.exists(),
        "report_count": len(get_available_reports()),
        "engine_available": forge_available(),
        "fork_configured": bool(engine_config.RPC_URL),
    })


@app.route("/api/scans", methods=["POST"])
def create_scan():
    """Starts a real Foundry simulation in the background.

    Body (all optional): {"modules": ["reentrancy", ...] | "all",
                          "variant": "both" | "vulnerable" | "protected",
                          "mode": "local" | "fork"}
    The RPC URL and fork block are never taken from the request; fork mode uses
    the server-side .env configuration only.
    """
    if not forge_available():
        return jsonify({"error": "Foundry ('forge') is not installed on the server"}), 503

    # Require a JSON content type: a cross-site "simple" POST (text/plain form) must not start a scan.
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 415

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    modules = body.get("modules", "all")
    if modules == "all":
        modules = None
    elif not isinstance(modules, list) or not all(isinstance(m, str) for m in modules):
        return jsonify({"error": "'modules' must be 'all' or a list of module ids"}), 400

    variant = body.get("variant", "both")
    if variant == "both":
        variants = None
    elif variant in ("vulnerable", "protected"):
        variants = [variant]
    else:
        return jsonify({"error": "'variant' must be both, vulnerable or protected"}), 400

    mode = body.get("mode", "local")
    try:
        scan_id = scan_manager.start(
            modules=modules,
            variants=variants,
            mode=mode,
            rpc_url=engine_config.RPC_URL if mode == "fork" else "",
            fork_block=engine_config.FORK_BLOCK if mode == "fork" else "",
        )
    except ScanBusyError as e:
        return jsonify({"error": str(e)}), 409
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify({"id": scan_id, "status": "queued"}), 202


@app.route("/api/scans/<scan_id>", methods=["GET"])
def get_scan(scan_id):
    """Returns live progress for a scan started via POST /api/scans."""
    snap = scan_manager.snapshot(scan_id)
    if snap is None:
        abort(404, description=f"Scan '{scan_id}' not found")
    return jsonify(snap)


@app.route("/api/scans/<scan_id>/cancel", methods=["POST"])
def cancel_scan(scan_id):
    """Requests cancellation; the scan stops before its next forge run."""
    if not scan_manager.cancel(scan_id):
        abort(404, description=f"Scan '{scan_id}' not found")
    return jsonify({"id": scan_id, "cancel_requested": True}), 202


@app.route("/api/reports", methods=["GET"])
def list_reports():
    """Returns list of available simulation reports."""
    reports = get_available_reports()
    return jsonify(reports)


@app.route("/api/reports/<report_id>", methods=["GET"])
def get_report(report_id):
    """Retrieves full JSON details for a specific report ID or 'latest'."""
    reports = get_available_reports()
    if not reports:
        abort(404, description="No reports found")

    target_filename = None
    if report_id == "latest":
        target_filename = reports[0]["filename"]
    else:
        # Match by ID or filename
        for r in reports:
            if r["id"] == report_id or r["filename"] == f"{report_id}.json" or r["filename"] == report_id:
                target_filename = r["filename"]
                break

    if not target_filename:
        # Check direct path
        direct_path = REPORTS_DIR / f"{report_id}.json"
        if direct_path.exists():
            target_filename = direct_path.name
        else:
            abort(404, description=f"Report '{report_id}' not found")

    filepath = REPORTS_DIR / target_filename
    if not filepath.exists():
        abort(404, description="Report file missing")

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            data["is_sample"] = (target_filename == "sample_report.json")
            return jsonify(data)
    except Exception as e:
        abort(500, description=f"Error reading report: {e}")


if __name__ == "__main__":
    print("[*] Starting DeFiSentinel Dashboard on http://127.0.0.1:5000 ...")
    app.run(host="127.0.0.1", port=5000, debug=False)
