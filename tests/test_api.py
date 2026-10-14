"""Tests for the DeFiSentinel Flask dashboard API (dashboard/serve.py).

Covers the three REST endpoints the frontend depends on: health, list reports,
and get a single report (by id, by "latest", and the sample-report fallback).
No real simulation run or Foundry install is needed — these tests write small
fake report JSON files straight into a temporary reports directory.
"""

import json
import pytest

import dashboard.serve as serve_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Flask test client pointed at an isolated, empty reports directory."""
    fake_reports_dir = tmp_path / "reports"
    fake_reports_dir.mkdir()

    monkeypatch.setattr(serve_module, "REPORTS_DIR", fake_reports_dir)
    monkeypatch.setattr(serve_module, "SAMPLE_REPORT_FILE", fake_reports_dir / "sample_report.json")

    serve_module.app.config.update(TESTING=True)
    with serve_module.app.test_client() as test_client:
        yield test_client


def _write_report(reports_dir, report_id, filename=None, **overrides):
    """Helper: writes a minimal valid report JSON file into reports_dir."""
    data = {
        "report_id": report_id,
        "generated_at": "2026-10-11T12:00:00+00:00",
        "mode": "local",
        "fork_block": None,
        "summary": {"total": 1, "succeeded": 1, "failed": 0},
        "results": [
            {
                "module": "reentrancy",
                "variant": "vulnerable",
                "status": "SUCCEEDED",
                "profit_eth": 10.0,
                "note": "drained vault via reentrant withdraw",
                "duration_s": 0.85,
            }
        ],
    }
    data.update(overrides)
    path = reports_dir / (filename or f"{report_id}.json")
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


# --- /api/health ---------------------------------------------------------

def test_health_reports_ok_status(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["status"] == "ok"
    assert body["reports_dir_exists"] is True
    assert body["report_count"] == 0


def test_health_reflects_report_count(client):
    _write_report(serve_module.REPORTS_DIR, "run-1")
    _write_report(serve_module.REPORTS_DIR, "run-2")
    resp = client.get("/api/health")
    assert resp.get_json()["report_count"] == 2


# --- /api/reports (list) --------------------------------------------------

def test_list_reports_empty_falls_back_to_sample(client):
    _write_report(serve_module.REPORTS_DIR, "sample_report", filename="sample_report.json")
    resp = client.get("/api/reports")
    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body) == 1
    assert body[0]["is_sample"] is True


def test_list_reports_prefers_real_reports_over_sample(client):
    _write_report(serve_module.REPORTS_DIR, "sample_report", filename="sample_report.json")
    _write_report(serve_module.REPORTS_DIR, "run-1")
    resp = client.get("/api/reports")
    body = resp.get_json()
    assert len(body) == 1
    assert body[0]["id"] == "run-1"
    assert body[0]["is_sample"] is False


def test_list_reports_truly_empty_returns_empty_list(client):
    resp = client.get("/api/reports")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_list_reports_summary_fields_present(client):
    _write_report(serve_module.REPORTS_DIR, "run-1", summary={"total": 4, "succeeded": 2, "failed": 2})
    body = client.get("/api/reports").get_json()
    assert body[0]["summary"] == {"total": 4, "succeeded": 2, "failed": 2}


# --- /api/reports/<id> (single report) -----------------------------------

def test_get_report_by_id(client):
    _write_report(serve_module.REPORTS_DIR, "run-1")
    resp = client.get("/api/reports/run-1")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["report_id"] == "run-1"
    assert body["is_sample"] is False


def test_get_report_latest_returns_most_recent(client):
    _write_report(serve_module.REPORTS_DIR, "run-older")
    _write_report(serve_module.REPORTS_DIR, "run-newer")
    # Force a clear mtime ordering regardless of filesystem write speed
    older = serve_module.REPORTS_DIR / "run-older.json"
    newer = serve_module.REPORTS_DIR / "run-newer.json"
    import os
    import time
    os.utime(older, (time.time() - 100, time.time() - 100))
    os.utime(newer, (time.time(), time.time()))

    resp = client.get("/api/reports/latest")
    assert resp.get_json()["report_id"] == "run-newer"


def test_get_report_unknown_id_returns_404_json(client):
    _write_report(serve_module.REPORTS_DIR, "run-1")
    resp = client.get("/api/reports/does-not-exist")
    assert resp.status_code == 404
    assert resp.is_json
    assert "error" in resp.get_json()


def test_get_report_when_no_reports_exist_returns_404(client):
    resp = client.get("/api/reports/anything")
    assert resp.status_code == 404
    assert resp.is_json


def test_get_report_marks_sample_report(client):
    _write_report(serve_module.REPORTS_DIR, "sample_report", filename="sample_report.json")
    resp = client.get("/api/reports/sample_report")
    assert resp.get_json()["is_sample"] is True


# --- / (index page) --------------------------------------------------------

def test_index_page_loads(client):
    resp = client.get("/")
    assert resp.status_code in (200, 302)
