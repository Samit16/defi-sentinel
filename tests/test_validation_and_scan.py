"""Comprehensive tests for DeFiSentinel file validation, compiler verification, and scan endpoints.

Covers all Phase 8 requirements:
- Input validation: missing file, 0-byte file, non-Solidity source, syntax error, size limits, extensions, binary encoding.
- Analysis execution: valid vulnerable contract, valid protected contract, compiler failure, timeout, missing tool.
- Report integrity: real reports vs failed scans, no mock fallback on analysis failure.
"""

import io
import json
import pytest
from pathlib import Path

import dashboard.serve as serve_module
from orchestrator.validator import validate_solidity_source, sanitize_filename, ValidationError
from orchestrator.compiler import compile_solidity_source, CompilationError
from orchestrator.scan_service import execute_scan

VALID_VULN_VAULT = """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimpleVulnVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance");
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
        balances[msg.sender] = 0;
    }
}
"""

VALID_PROTECTED_VAULT = """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimpleProtectedVault {
    mapping(address => uint256) public balances;
    bool private locked;

    modifier nonReentrant() {
        require(!locked, "ReentrancyGuard: reentrant call");
        locked = true;
        _;
        locked = false;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No balance");
        balances[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
"""

MALFORMED_SOL = """// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BrokenSyntax {
    function broken() public {
        this is total nonsense syntax !!!
    }
}
"""


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


# =========================================================================
# 1. UNIT VALIDATION TESTS
# =========================================================================

def test_sanitize_filename_rejects_empty():
    with pytest.raises(ValidationError) as exc:
        sanitize_filename("")
    assert exc.value.code == "MISSING_FILENAME"


def test_sanitize_filename_rejects_non_sol():
    with pytest.raises(ValidationError) as exc:
        sanitize_filename("contract.py")
    assert exc.value.code == "INVALID_EXTENSION"


def test_sanitize_filename_prevents_path_traversal():
    safe = sanitize_filename("../../../secret/MyContract.sol")
    assert "/" not in safe and "\\" not in safe and ".." not in safe
    assert safe.endswith(".sol")


def test_validate_rejects_empty_file():
    with pytest.raises(ValidationError) as exc:
        validate_solidity_source("", "Empty.sol")
    assert exc.value.code == "EMPTY_FILE"


def test_validate_rejects_non_solidity_content():
    with pytest.raises(ValidationError) as exc:
        validate_solidity_source("const x = 42; console.log(x);", "Test.sol")
    assert exc.value.code == "NOT_SOLIDITY"


def test_validate_rejects_binary_null_bytes():
    with pytest.raises(ValidationError) as exc:
        validate_solidity_source(b"pragma solidity\x00^0.8.20;", "Binary.sol")
    assert exc.value.code == "INVALID_ENCODING"


def test_validate_rejects_oversized_file():
    huge_code = "// " + ("x" * (101 * 1024)) + "\ncontract Foo {}"
    with pytest.raises(ValidationError) as exc:
        validate_solidity_source(huge_code, "Huge.sol")
    assert exc.value.code == "FILE_TOO_LARGE"


def test_validate_accepts_valid_solidity():
    safe_name, clean_source, source_hash, contracts = validate_solidity_source(
        VALID_VULN_VAULT, "MyVault.sol"
    )
    assert safe_name == "MyVault.sol"
    assert "SimpleVulnVault" in contracts
    assert len(source_hash) == 64


# =========================================================================
# 2. API /api/validate ENDPOINT TESTS
# =========================================================================

def test_api_validate_missing_input_returns_400(client):
    resp = client.post("/api/validate", json={})
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "MISSING_INPUT"


def test_api_validate_empty_source_returns_400(client):
    resp = client.post("/api/validate", json={"source": "   ", "filename": "Test.sol"})
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "EMPTY_FILE"


def test_api_validate_invalid_extension_returns_400(client):
    resp = client.post("/api/validate", json={"source": VALID_VULN_VAULT, "filename": "Test.txt"})
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "INVALID_EXTENSION"


def test_api_validate_non_solidity_returns_400(client):
    resp = client.post("/api/validate", json={"source": "hello world plain text", "filename": "Test.sol"})
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "NOT_SOLIDITY"


def test_api_validate_malformed_syntax_returns_422(client):
    resp = client.post("/api/validate", json={"source": MALFORMED_SOL, "filename": "Broken.sol"})
    assert resp.status_code == 422
    body = resp.get_json()
    assert body["code"] == "COMPILATION_FAILED"
    assert "error" in body


def test_api_validate_valid_source_returns_200(client):
    resp = client.post("/api/validate", json={"source": VALID_VULN_VAULT, "filename": "Vault.sol"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["status"] == "valid"
    assert body["primary_contract"] == "SimpleVulnVault"
    assert "deposit" in body["functions"]
    assert "withdraw" in body["functions"]


def test_api_validate_multipart_upload_returns_200(client):
    data = {
        "file": (io.BytesIO(VALID_VULN_VAULT.encode("utf-8")), "MultipartVault.sol"),
    }
    resp = client.post("/api/validate", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    assert resp.get_json()["filename"] == "MultipartVault.sol"


# =========================================================================
# 3. API /api/scan ENDPOINT TESTS
# =========================================================================

def test_api_scan_missing_file_returns_400(client):
    resp = client.post("/api/scan", json={})
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "MISSING_INPUT"


def test_api_scan_malformed_syntax_returns_422_without_report(client):
    resp = client.post("/api/scan", json={"source": MALFORMED_SOL, "filename": "Bad.sol"})
    assert resp.status_code == 422
    body = resp.get_json()
    assert body["code"] == "COMPILATION_FAILED"
    # Verify no report was fabricated
    assert len(list(serve_module.REPORTS_DIR.glob("*.json"))) == 0


def test_api_scan_executes_real_simulation_vulnerable(client):
    resp = client.post(
        "/api/scan",
        json={
            "source": VALID_VULN_VAULT,
            "filename": "SimpleVulnVault.sol",
            "protocol": "VAULT",
            "roleMap": {"deposit": "deposit", "withdraw": "withdraw"},
        },
    )
    assert resp.status_code == 200
    report = resp.get_json()
    assert report["is_real"] is True
    assert report["target"] == "SimpleVulnVault.sol"
    assert report["summary"]["total"] == 4
    # Reentrancy attack must succeed on vulnerable vault
    reentrancy_res = next(r for r in report["results"] if r["module"] == "reentrancy")
    assert reentrancy_res["status"] == "SUCCEEDED"
    assert reentrancy_res["profit_eth"] > 0
    # Verify report is saved on disk
    saved_file = serve_module.REPORTS_DIR / f"{report['report_id']}.json"
    assert saved_file.exists()


def test_api_scan_executes_real_simulation_protected(client):
    resp = client.post(
        "/api/scan",
        json={
            "source": VALID_PROTECTED_VAULT,
            "filename": "SimpleProtectedVault.sol",
            "protocol": "VAULT",
            "roleMap": {"deposit": "deposit", "withdraw": "withdraw"},
        },
    )
    assert resp.status_code == 200
    report = resp.get_json()
    assert report["is_real"] is True
    assert report["summary"]["succeeded"] == 0
    # Reentrancy attack must be blocked on protected vault
    reentrancy_res = next(r for r in report["results"] if r["module"] == "reentrancy")
    assert reentrancy_res["status"] == "FAILED"
    assert reentrancy_res["profit_eth"] == 0.0


def test_api_scan_handles_timeout_gracefully(client, monkeypatch):
    import orchestrator.scan_service as scan_service_module

    def mock_run_forge_timeout(*args, **kwargs):
        raise TimeoutError("Forge test timed out after 60s")

    monkeypatch.setattr(scan_service_module.runner, "run_forge_test", mock_run_forge_timeout)

    resp = client.post(
        "/api/scan",
        json={
            "source": VALID_VULN_VAULT,
            "filename": "TimeoutVault.sol",
            "protocol": "VAULT",
        },
    )
    assert resp.status_code == 504
    body = resp.get_json()
    assert body["code"] == "ANALYSIS_TIMEOUT"
    assert len(list(serve_module.REPORTS_DIR.glob("*.json"))) == 0


def test_api_scan_handles_missing_forge_binary(client, monkeypatch):
    import orchestrator.compiler as compiler_module

    def mock_compile(*args, **kwargs):
        raise RuntimeError("Foundry executable 'forge' not found.")

    monkeypatch.setattr(compiler_module, "compile_solidity_source", mock_compile)

    resp = client.post(
        "/api/scan",
        json={
            "source": VALID_VULN_VAULT,
            "filename": "NoForge.sol",
            "protocol": "VAULT",
        },
    )
    assert resp.status_code == 500
    body = resp.get_json()
    assert "Foundry executable 'forge' not found" in body["error"]
    assert len(list(serve_module.REPORTS_DIR.glob("*.json"))) == 0
