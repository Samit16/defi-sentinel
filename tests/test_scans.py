"""Tests for the background scan manager and the /api/scans endpoints.

Foundry is replaced by injected fakes, so these run anywhere (no forge needed).
"""

import threading
import time

import pytest

import dashboard.serve as serve_module
from orchestrator.scan_manager import ScanBusyError, ScanManager


def fake_result(module, variant, profit=1.0):
    succeeded = variant == "vulnerable"
    return {
        "module": module,
        "variant": variant,
        "status": "SUCCEEDED" if succeeded else "FAILED",
        "profit_eth": profit if succeeded else 0.0,
        "note": "fake",
        "duration_s": 0.01,
    }


def make_manager(run_single=None, ensure_built=None, written=None):
    written = written if written is not None else []

    def writer(results, mode="local", fork_block=None):
        written.append({"results": results, "mode": mode, "fork_block": fork_block})
        from pathlib import Path
        return Path("reports/FAKE-REPORT.json")

    return ScanManager(
        run_single=run_single or (lambda m, v, **kw: fake_result(m, v)),
        ensure_built=ensure_built or (lambda: None),
        report_writer=writer,
    ), written


def wait_done(manager, scan_id, timeout=5):
    manager.join(scan_id, timeout)
    return manager.snapshot(scan_id)


# --- ScanManager ---------------------------------------------------------

def test_full_scan_runs_every_module_and_variant_and_writes_report():
    manager, written = make_manager()
    scan_id = manager.start(modules=["reentrancy", "oracle"])
    snap = wait_done(manager, scan_id)

    assert snap["status"] == "done"
    assert snap["overall"] == 100
    assert snap["report_id"] == "FAKE-REPORT"
    assert [r["state"] for r in snap["rows"]] == ["DONE", "DONE"]
    assert len(written) == 1
    assert len(written[0]["results"]) == 4  # 2 modules x 2 variants


def test_variant_subset_is_respected():
    calls = []

    def run_single(module, variant, **kw):
        calls.append((module, variant))
        return fake_result(module, variant)

    manager, _ = make_manager(run_single=run_single)
    scan_id = manager.start(modules=["governance"], variants=["protected"])
    assert wait_done(manager, scan_id)["status"] == "done"
    assert calls == [("governance", "protected")]


def test_unknown_module_rejected():
    manager, _ = make_manager()
    with pytest.raises(ValueError, match="Unknown module"):
        manager.start(modules=["nope"])


def test_invalid_variant_and_mode_rejected():
    manager, _ = make_manager()
    with pytest.raises(ValueError):
        manager.start(variants=["sideways"])
    with pytest.raises(ValueError):
        manager.start(mode="mainnet")


def test_fork_mode_requires_rpc_url():
    manager, _ = make_manager()
    with pytest.raises(ValueError, match="RPC_URL"):
        manager.start(mode="fork", rpc_url="")


def test_engine_failure_is_reported_as_error_not_raised():
    def boom(module, variant, **kw):
        raise RuntimeError("compile exploded")

    manager, written = make_manager(run_single=boom)
    snap = wait_done(manager, manager.start(modules=["reentrancy"]))
    assert snap["status"] == "error"
    assert "compile exploded" in snap["error"]
    assert written == []  # no partial report is persisted


def test_build_failure_is_reported():
    def bad_build():
        raise RuntimeError("forge build failed")

    manager, _ = make_manager(ensure_built=bad_build)
    snap = wait_done(manager, manager.start())
    assert snap["status"] == "error"
    assert "forge build failed" in snap["error"]


def test_second_scan_rejected_while_one_is_running():
    gate = threading.Event()

    def slow(module, variant, **kw):
        gate.wait(5)
        return fake_result(module, variant)

    manager, _ = make_manager(run_single=slow)
    first = manager.start(modules=["reentrancy"])
    with pytest.raises(ScanBusyError):
        manager.start(modules=["oracle"])
    gate.set()
    assert wait_done(manager, first)["status"] == "done"
    # once finished a new scan is accepted again
    second = manager.start(modules=["oracle"])
    assert wait_done(manager, second)["status"] == "done"


def test_cancel_stops_before_next_run_and_writes_no_report():
    started = threading.Event()
    gate = threading.Event()

    def slow(module, variant, **kw):
        started.set()
        gate.wait(5)
        return fake_result(module, variant)

    manager, written = make_manager(run_single=slow)
    scan_id = manager.start(modules=["reentrancy", "oracle"])
    assert started.wait(5)
    assert manager.cancel(scan_id) is True
    gate.set()
    snap = wait_done(manager, scan_id)
    assert snap["status"] == "cancelled"
    assert written == []


def test_snapshot_and_cancel_unknown_scan():
    manager, _ = make_manager()
    assert manager.snapshot("missing") is None
    assert manager.cancel("missing") is False


def test_progress_is_visible_midway():
    gate = threading.Event()
    first_done = threading.Event()

    def stepped(module, variant, **kw):
        if module == "oracle":
            first_done.set()
            gate.wait(5)
        return fake_result(module, variant)

    manager, _ = make_manager(run_single=stepped)
    scan_id = manager.start(modules=["reentrancy", "oracle"])
    assert first_done.wait(5)
    time.sleep(0.05)
    snap = manager.snapshot(scan_id)
    assert snap["status"] == "running"
    assert snap["rows"][0]["state"] == "DONE"
    assert snap["rows"][1]["state"] == "RUNNING"
    assert 0 < snap["overall"] < 100
    gate.set()
    wait_done(manager, scan_id)


# --- HTTP API ------------------------------------------------------------

@pytest.fixture
def client(monkeypatch):
    manager, written = make_manager()
    monkeypatch.setattr(serve_module, "scan_manager", manager)
    monkeypatch.setattr(serve_module, "forge_available", lambda: True)
    serve_module.app.config.update(TESTING=True)
    with serve_module.app.test_client() as c:
        c.manager = manager
        c.written = written
        yield c


def test_post_scan_then_poll_until_done(client):
    resp = client.post("/api/scans", json={"modules": ["reentrancy"], "variant": "both"})
    assert resp.status_code == 202
    scan_id = resp.get_json()["id"]

    client.manager.join(scan_id, 5)
    body = client.get(f"/api/scans/{scan_id}").get_json()
    assert body["status"] == "done"
    assert body["report_id"] == "FAKE-REPORT"
    assert body["rows"][0]["module"] == "reentrancy"
    assert len(body["rows"][0]["results"]) == 2


def test_post_scan_defaults_to_all_modules(client):
    scan_id = client.post("/api/scans", json={}).get_json()["id"]
    client.manager.join(scan_id, 5)
    assert len(client.get(f"/api/scans/{scan_id}").get_json()["rows"]) == 4


def test_post_scan_rejects_bad_input(client):
    assert client.post("/api/scans", json={"modules": ["nope"]}).status_code == 400
    assert client.post("/api/scans", json={"modules": "reentrancy"}).status_code == 400
    assert client.post("/api/scans", json={"variant": "weird"}).status_code == 400
    assert client.post("/api/scans", json=[1, 2]).status_code == 400
    assert client.post("/api/scans", json={"mode": "fork"}).status_code == 400  # no RPC configured


def test_post_scan_requires_json_content_type(client):
    resp = client.post("/api/scans", data="modules=all", content_type="text/plain")
    assert resp.status_code == 415


def test_request_cannot_supply_rpc_url(client, monkeypatch):
    monkeypatch.setattr(serve_module.engine_config, "RPC_URL", "")
    resp = client.post("/api/scans", json={"mode": "fork", "rpc_url": "http://evil.example"})
    assert resp.status_code == 400


def test_post_scan_conflict_when_busy(client, monkeypatch):
    gate = threading.Event()
    manager, _ = make_manager(run_single=lambda m, v, **kw: (gate.wait(5), fake_result(m, v))[1])
    monkeypatch.setattr(serve_module, "scan_manager", manager)
    first = client.post("/api/scans", json={"modules": ["reentrancy"]})
    assert first.status_code == 202
    second = client.post("/api/scans", json={"modules": ["oracle"]})
    assert second.status_code == 409
    gate.set()
    manager.join(first.get_json()["id"], 5)


def test_post_scan_503_without_forge(client, monkeypatch):
    monkeypatch.setattr(serve_module, "forge_available", lambda: False)
    assert client.post("/api/scans", json={}).status_code == 503


def test_get_unknown_scan_is_json_404(client):
    resp = client.get("/api/scans/doesnotexist")
    assert resp.status_code == 404
    assert "error" in resp.get_json()


def test_cancel_endpoint(client):
    assert client.post("/api/scans/doesnotexist/cancel").status_code == 404
    scan_id = client.post("/api/scans", json={"modules": ["reentrancy"]}).get_json()["id"]
    assert client.post(f"/api/scans/{scan_id}/cancel").status_code == 202
    client.manager.join(scan_id, 5)


def test_health_reports_engine_flags(client, monkeypatch, tmp_path):
    monkeypatch.setattr(serve_module, "REPORTS_DIR", tmp_path)
    body = client.get("/api/health").get_json()
    assert body["engine_available"] is True
    assert "fork_configured" in body
