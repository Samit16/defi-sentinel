"""Tests for the target upload and scan endpoints (dashboard/scans.py).

Forge is never invoked: run_forge_test is replaced with a fake that returns a
SENTINEL_RESULT line, so these tests need no Foundry install.
"""

import json
import threading
import time

import pytest

import dashboard.scans as scans
import dashboard.serve as serve_module
import orchestrator.report_writer as report_writer
from orchestrator.config import MODULE_REGISTRY

VALID_SOURCE = (
    "// SPDX-License-Identifier: MIT\n"
    "pragma solidity ^0.8.20;\n"
    "contract Vault { uint256 public x; }\n"
)

PATH_TO_MODULE = {path: module for module, path in MODULE_REGISTRY.items()}


def fake_forge(test_path, variant, mode="local", rpc_url="", fork_block="", timeout_s=60):
    module = PATH_TO_MODULE[test_path]
    if variant == "vulnerable":
        line = f"SENTINEL_RESULT|{module}|{variant}|SUCCEEDED|10000000000000000000|drained"
    else:
        line = f"SENTINEL_RESULT|{module}|{variant}|FAILED|0|blocked"
    return f"noise\n{line}\n", 0.01


@pytest.fixture
def client(tmp_path, monkeypatch):
    reports_dir = tmp_path / "reports"
    reports_dir.mkdir()

    monkeypatch.setattr(scans, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(scans, "run_forge_test", fake_forge)
    monkeypatch.setattr(report_writer, "REPORTS_DIR", reports_dir)
    monkeypatch.setattr(serve_module, "REPORTS_DIR", reports_dir)
    monkeypatch.setattr(serve_module, "SAMPLE_REPORT_FILE", reports_dir / "sample_report.json")

    scans._targets.clear()
    scans._jobs.clear()
    scans._job_order.clear()

    serve_module.app.config.update(TESTING=True)
    with serve_module.app.test_client() as test_client:
        yield test_client


def wait_for_scan(client, scan_id, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/api/scans/{scan_id}").get_json()
        if body["status"] in ("done", "failed"):
            return body
        time.sleep(0.02)
    raise AssertionError("scan did not finish in time")


# --- POST /api/targets -------------------------------------------------------

def test_create_target_stores_file(client):
    resp = client.post("/api/targets", json={"filename": "Vault.sol", "source": VALID_SOURCE})
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["target_id"].startswith("tgt-")
    assert body["filename"] == "Vault.sol"
    assert body["size_bytes"] == len(VALID_SOURCE.encode("utf-8"))
    stored = scans.UPLOAD_DIR / body["target_id"] / "Vault.sol"
    assert stored.read_text(encoding="utf-8") == VALID_SOURCE


@pytest.mark.parametrize(
    "filename",
    ["Vault.txt", "../Vault.sol", "sub/Vault.sol", "Vault", "", ".sol", "a b.sol"],
)
def test_create_target_rejects_bad_filename(client, filename):
    resp = client.post("/api/targets", json={"filename": filename, "source": VALID_SOURCE})
    assert resp.status_code == 400


def test_create_target_rejects_missing_pragma(client):
    resp = client.post(
        "/api/targets",
        json={"filename": "Vault.sol", "source": "contract Vault {}"},
    )
    assert resp.status_code == 400


def test_create_target_rejects_no_contract(client):
    resp = client.post(
        "/api/targets",
        json={"filename": "Vault.sol", "source": "pragma solidity ^0.8.20;\n"},
    )
    assert resp.status_code == 400


def test_create_target_rejects_oversized_source(client):
    big = VALID_SOURCE + "// " + "x" * (scans.MAX_SOURCE_BYTES + 1)
    resp = client.post("/api/targets", json={"filename": "Vault.sol", "source": big})
    assert resp.status_code == 413


def test_create_target_rejects_non_json_body(client):
    resp = client.post("/api/targets", data="not json", content_type="text/plain")
    assert resp.status_code == 400
    assert resp.is_json


# --- POST /api/scans + GET /api/scans/<id> -----------------------------------

def test_scan_runs_all_modules_and_writes_report(client):
    resp = client.post("/api/scans", json={})
    assert resp.status_code == 202
    scan_id = resp.get_json()["scan_id"]

    body = wait_for_scan(client, scan_id)
    assert body["status"] == "done"
    assert body["overall"] == 100
    assert body["target_analyzed"] is False
    assert len(body["results"]) == 8
    assert body["errors"] == []
    assert [r["state"] for r in body["rows"]] == ["DONE"] * 4
    assert all(r["progress"] == 100 for r in body["rows"])
    assert body["report_id"]

    # The report written by the scan is readable through the existing API.
    report = client.get(f"/api/reports/{body['report_id']}").get_json()
    assert report["summary"] == {"total": 8, "succeeded": 4, "failed": 4}


def test_scan_respects_module_and_variant_selection(client):
    resp = client.post(
        "/api/scans", json={"modules": ["reentrancy", "oracle"], "variant": "vulnerable"}
    )
    body = wait_for_scan(client, resp.get_json()["scan_id"])
    assert body["modules"] == ["reentrancy", "oracle"]
    assert [r["variant"] for r in body["results"]] == ["vulnerable", "vulnerable"]


def test_scan_accepts_comma_separated_modules(client):
    resp = client.post("/api/scans", json={"modules": "reentrancy,governance"})
    assert resp.status_code == 202
    assert resp.get_json()["modules"] == ["reentrancy", "governance"]
    wait_for_scan(client, resp.get_json()["scan_id"])


def test_scan_with_known_target_id(client):
    target_id = client.post(
        "/api/targets", json={"filename": "Vault.sol", "source": VALID_SOURCE}
    ).get_json()["target_id"]
    resp = client.post("/api/scans", json={"target_id": target_id, "modules": ["reentrancy"]})
    assert resp.status_code == 202
    assert resp.get_json()["target_id"] == target_id
    wait_for_scan(client, resp.get_json()["scan_id"])


def test_scan_unknown_target_returns_404(client):
    resp = client.post("/api/scans", json={"target_id": "tgt-nope"})
    assert resp.status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"modules": ["nope"]},
        {"modules": []},
        {"modules": [1]},
        {"variant": "sideways"},
        {"mode": "remote"},
        {"target_id": 5},
    ],
)
def test_scan_rejects_invalid_payload(client, payload):
    resp = client.post("/api/scans", json=payload)
    assert resp.status_code == 400
    assert "error" in resp.get_json()


def test_scan_fork_mode_requires_rpc_url(client, monkeypatch):
    monkeypatch.setattr(scans, "CONFIG_RPC_URL", "")
    resp = client.post("/api/scans", json={"mode": "fork"})
    assert resp.status_code == 400


def test_scan_fork_mode_rejects_bad_block(client, monkeypatch):
    monkeypatch.setattr(scans, "CONFIG_RPC_URL", "http://rpc.invalid")
    resp = client.post("/api/scans", json={"mode": "fork", "fork_block": "abc"})
    assert resp.status_code == 400


def test_scan_fork_mode_uses_env_rpc_and_passes_block(client, monkeypatch):
    seen = {}

    def spy(test_path, variant, mode="local", rpc_url="", fork_block="", timeout_s=60):
        seen.update(mode=mode, rpc_url=rpc_url, fork_block=fork_block)
        return fake_forge(test_path, variant)

    monkeypatch.setattr(scans, "CONFIG_RPC_URL", "http://rpc.invalid")
    monkeypatch.setattr(scans, "run_forge_test", spy)
    resp = client.post(
        "/api/scans",
        json={"mode": "fork", "fork_block": "123", "rpc_url": "http://attacker.invalid"},
    )
    assert resp.status_code == 202
    body = wait_for_scan(client, resp.get_json()["scan_id"])
    assert seen == {"mode": "fork", "rpc_url": "http://rpc.invalid", "fork_block": "123"}
    assert body["fork_block"] == "123"


def test_second_scan_while_running_returns_409(client, monkeypatch):
    release = threading.Event()

    def blocking(*args, **kwargs):
        release.wait(5)
        return fake_forge(*args, **kwargs)

    monkeypatch.setattr(scans, "run_forge_test", blocking)
    first = client.post("/api/scans", json={"modules": ["reentrancy"]})
    assert first.status_code == 202

    second = client.post("/api/scans", json={"modules": ["reentrancy"]})
    assert second.status_code == 409
    assert first.get_json()["scan_id"] in second.get_json()["error"]

    release.set()
    wait_for_scan(client, first.get_json()["scan_id"])

    third = client.post("/api/scans", json={"modules": ["reentrancy"]})
    assert third.status_code == 202
    wait_for_scan(client, third.get_json()["scan_id"])


def test_running_scan_reports_partial_progress(client, monkeypatch):
    release = threading.Event()

    def gated(test_path, variant, **kwargs):
        if PATH_TO_MODULE[test_path] == "oracle":
            release.wait(5)
        return fake_forge(test_path, variant)

    monkeypatch.setattr(scans, "run_forge_test", gated)
    scan_id = client.post("/api/scans", json={"modules": ["reentrancy", "oracle"]}).get_json()["scan_id"]

    deadline = time.time() + 5
    while time.time() < deadline:
        body = client.get(f"/api/scans/{scan_id}").get_json()
        if body["rows"][0]["state"] == "DONE" and body["rows"][1]["state"] == "RUNNING":
            break
        time.sleep(0.02)
    else:
        raise AssertionError("never saw partial progress")

    assert body["status"] == "running"
    assert body["overall"] == 50
    assert body["report_id"] is None
    release.set()
    assert wait_for_scan(client, scan_id)["status"] == "done"


def test_one_failing_module_does_not_stop_the_scan(client, monkeypatch):
    def flaky(test_path, variant, **kwargs):
        if PATH_TO_MODULE[test_path] == "oracle":
            raise RuntimeError("forge exploded")
        return fake_forge(test_path, variant)

    monkeypatch.setattr(scans, "run_forge_test", flaky)
    body = wait_for_scan(client, client.post("/api/scans", json={}).get_json()["scan_id"])

    assert body["status"] == "done"
    assert len(body["results"]) == 6
    states = {r["module"]: r["state"] for r in body["rows"]}
    assert states["oracle"] == "ERROR"
    assert states["reentrancy"] == "DONE"
    assert {e["module"] for e in body["errors"]} == {"oracle"}
    assert "forge exploded" in body["errors"][0]["error"]


def test_scan_fails_when_every_run_fails(client, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("no forge")

    monkeypatch.setattr(scans, "run_forge_test", broken)
    body = wait_for_scan(client, client.post("/api/scans", json={}).get_json()["scan_id"])

    assert body["status"] == "failed"
    assert body["report_id"] is None
    assert body["results"] == []
    assert list(serve_module.REPORTS_DIR.glob("*.json")) == []


def test_mismatched_result_marker_is_recorded_as_error(client, monkeypatch):
    def wrong_module(test_path, variant, **kwargs):
        return f"SENTINEL_RESULT|other|{variant}|FAILED|0|stale", 0.01

    monkeypatch.setattr(scans, "run_forge_test", wrong_module)
    body = wait_for_scan(
        client, client.post("/api/scans", json={"modules": ["reentrancy"]}).get_json()["scan_id"]
    )
    assert body["status"] == "failed"
    assert "Expected reentrancy/vulnerable" in body["errors"][0]["error"]


def test_get_unknown_scan_returns_404_json(client):
    resp = client.get("/api/scans/scan-nope")
    assert resp.status_code == 404
    assert resp.is_json


def test_scan_snapshot_is_json_serializable_and_hides_internals(client):
    scan_id = client.post("/api/scans", json={"modules": ["reentrancy"]}).get_json()["scan_id"]
    body = wait_for_scan(client, scan_id)
    json.dumps(body)
    for row in body["rows"]:
        assert not any(key.startswith("_") for key in row)


def test_old_jobs_are_evicted(client, monkeypatch):
    monkeypatch.setattr(scans, "MAX_JOBS_KEPT", 2)
    ids = []
    for _ in range(3):
        scan_id = client.post("/api/scans", json={"modules": ["reentrancy"]}).get_json()["scan_id"]
        wait_for_scan(client, scan_id)
        ids.append(scan_id)
    assert client.get(f"/api/scans/{ids[0]}").status_code == 404
    assert client.get(f"/api/scans/{ids[2]}").status_code == 200