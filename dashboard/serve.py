"""Flask web server for the DeFiSentinel security simulation dashboard.

Serves static UI assets and provides REST endpoints for listing and viewing reports.
"""

import json
from pathlib import Path
from flask import Flask, jsonify, render_template, abort

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = PROJECT_ROOT / "reports"
SAMPLE_REPORT_FILE = REPORTS_DIR / "sample_report.json"

app = Flask(
    __name__,
    template_folder=str(Path(__file__).resolve().parent / "templates"),
    static_folder=str(Path(__file__).resolve().parent / "static"),
)


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
