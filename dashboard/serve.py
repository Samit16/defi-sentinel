"""Flask web server for the DeFiSentinel security simulation dashboard.

Serves backend API endpoints for listing and viewing reports.
The frontend (dashboard-next) is a Next.js application served on port 3000.
"""

import json
import sys
from pathlib import Path
from flask import Flask, jsonify, redirect, abort, request

PROJECT_ROOT = Path(__file__).resolve().parent.parent
# Lets `python dashboard/serve.py` import the dashboard and orchestrator packages.
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.scans import scans_bp  # noqa: E402

REPORTS_DIR = PROJECT_ROOT / "reports"
SAMPLE_REPORT_FILE = REPORTS_DIR / "sample_report.json"

app = Flask(__name__)
app.register_blueprint(scans_bp)


@app.errorhandler(404)
def handle_not_found(e):
    """Returns JSON for 404s on API routes."""
    if request.path.startswith("/api/"):
        return jsonify({"error": getattr(e, "description", "Not found")}), 404
    return e


@app.errorhandler(500)
def handle_server_error(e):
    """Returns JSON for 500s on API routes."""
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
    """Redirects browser to the Next.js dashboard on port 3000."""
    return redirect("http://localhost:3000/", code=302)


@app.route("/api/health", methods=["GET"])
def health():
    """Lightweight liveness check."""
    return jsonify({
        "status": "ok",
        "reports_dir_exists": REPORTS_DIR.exists(),
        "report_count": len(get_available_reports()),
    })


@app.route("/api/reports", methods=["GET"])
def list_reports():
    """Returns list of available simulation reports."""
    return jsonify(get_available_reports())


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
        for r in reports:
            if r["id"] == report_id or r["filename"] == f"{report_id}.json" or r["filename"] == report_id:
                target_filename = r["filename"]
                break

    if not target_filename:
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
    import subprocess, threading, time, webbrowser, socket, sys, urllib.request

    NEXT_DIR = str(Path(__file__).resolve().parent.parent / "dashboard-next")
    NEXT_URL = "http://127.0.0.1:3000/"
    FLASK_URL = "http://127.0.0.1:5000/api/health"
    STARTUP_TIMEOUT = 120  # seconds

    next_proc = None
    owns_next_process = False

    def _kill_tree(proc):
        """Terminate the npm/Node process tree on Windows using taskkill, falling back to proc.kill()."""
        try:
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    def _is_port_open(host, port):
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            return False

    def _check_http(url):
        """Single HTTP GET with a 3-second timeout. Returns True on HTTP 200."""
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                return resp.status == 200
        except Exception:
            return False

    def _wait_http_ok(url, deadline, proc=None):
        """
        Poll url until HTTP 200 or deadline passes.
        If proc is given, abort early when it exits unexpectedly.
        Returns True on success, False on timeout/crash.
        """
        while time.time() < deadline:
            if _check_http(url):
                return True
            if proc is not None and proc.poll() is not None:
                print("[!] Next.js process terminated unexpectedly.")
                return False
            time.sleep(0.5)
        return False

    # ── Step 1: Start or reuse Next.js ──────────────────────────────────────
    if _is_port_open("127.0.0.1", 3000):
        print("[*] Port 3000 is already in use – verifying dashboard responds...")
        if _check_http(NEXT_URL):
            print("[*] Existing Next.js dashboard is responding – reusing it.")
            webbrowser.open("http://localhost:3000/")
        else:
            print("[!] Port 3000 occupied but dashboard did not respond. Aborting.")
            sys.exit(1)
    else:
        print("[*] Starting Next.js dashboard (npm run dev)...")
        try:
            next_proc = subprocess.Popen(
                ["npm.cmd", "run", "dev"],
                cwd=NEXT_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
        except FileNotFoundError:
            print("[!] npm.cmd not found. Ensure Node.js is installed and on PATH.")
            sys.exit(1)

        owns_next_process = True

        # Drain Next.js logs continuously in a background thread
        def _drain():
            try:
                for line in iter(next_proc.stdout.readline, ""):
                    sys.stdout.write(line)
                    sys.stdout.flush()
            except Exception:
                pass
        threading.Thread(target=_drain, daemon=True).start()

        deadline = time.time() + STARTUP_TIMEOUT
        if not _wait_http_ok(NEXT_URL, deadline, proc=next_proc):
            if time.time() >= deadline:
                print(f"[!] Next.js did not respond within {STARTUP_TIMEOUT}s.")
            _kill_tree(next_proc)
            sys.exit(1)

        print("[*] Next.js dashboard is up at http://localhost:3000/")
        webbrowser.open("http://localhost:3000/")

    # ── Step 2: Start Flask backend ─────────────────────────────────────────
    print("[*] Starting Flask backend on http://127.0.0.1:5000 ...")
    try:
        app.run(host="127.0.0.1", port=5000, debug=False)
    finally:
        if owns_next_process and next_proc and next_proc.poll() is None:
            print("[*] Shutting down Next.js process tree ...")
            _kill_tree(next_proc)
            print("[*] Next.js shutdown complete.")
