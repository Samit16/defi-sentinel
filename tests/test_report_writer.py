"""Tests for orchestrator/report_writer.py.

Checks that simulation results are assembled into the frozen report schema
correctly (counts, mode, fork_block) and that reports are actually persisted
to disk as valid, re-readable JSON.
"""

import json

from orchestrator.report_writer import generate_report_data, write_report


SAMPLE_RESULTS = [
    {"module": "reentrancy", "variant": "vulnerable", "status": "SUCCEEDED",
     "profit_eth": 10.0, "note": "drained vault", "duration_s": 0.85},
    {"module": "reentrancy", "variant": "protected", "status": "FAILED",
     "profit_eth": 0.0, "note": "blocked by mutex", "duration_s": 0.82},
    {"module": "oracle", "variant": "vulnerable", "status": "SUCCEEDED",
     "profit_eth": 61.9, "note": "spot price pump", "duration_s": 1.10},
]


def test_generate_report_data_counts_succeeded_and_failed():
    report = generate_report_data(SAMPLE_RESULTS, mode="local")
    assert report["summary"]["total"] == 3
    assert report["summary"]["succeeded"] == 2
    assert report["summary"]["failed"] == 1


def test_generate_report_data_has_required_fields():
    report = generate_report_data(SAMPLE_RESULTS, mode="local")
    for key in ("report_id", "generated_at", "mode", "fork_block", "summary", "results"):
        assert key in report
    assert report["results"] == SAMPLE_RESULTS


def test_generate_report_data_empty_fork_block_becomes_none():
    report = generate_report_data(SAMPLE_RESULTS, mode="local", fork_block="")
    assert report["fork_block"] is None


def test_generate_report_data_fork_block_is_cast_to_int():
    report = generate_report_data(SAMPLE_RESULTS, mode="fork", fork_block="18500000")
    assert report["fork_block"] == 18500000
    assert isinstance(report["fork_block"], int)


def test_generate_report_data_empty_results_list():
    report = generate_report_data([], mode="local")
    assert report["summary"] == {"total": 0, "succeeded": 0, "failed": 0}
    assert report["results"] == []


def test_write_report_persists_valid_json_to_reports_dir(tmp_path, monkeypatch):
    import orchestrator.report_writer as report_writer_module
    monkeypatch.setattr(report_writer_module, "REPORTS_DIR", tmp_path)

    report_path = write_report(SAMPLE_RESULTS, mode="local")

    assert report_path.exists()
    assert report_path.parent == tmp_path

    with open(report_path, "r", encoding="utf-8") as f:
        saved = json.load(f)
    assert saved["summary"]["total"] == 3


def test_write_report_filename_matches_report_id(tmp_path, monkeypatch):
    import orchestrator.report_writer as report_writer_module
    monkeypatch.setattr(report_writer_module, "REPORTS_DIR", tmp_path)

    report_path = write_report(SAMPLE_RESULTS, mode="local")
    with open(report_path, "r", encoding="utf-8") as f:
        saved = json.load(f)

    assert report_path.stem == saved["report_id"]


def test_write_report_creates_reports_dir_if_missing(tmp_path, monkeypatch):
    import orchestrator.report_writer as report_writer_module
    missing_dir = tmp_path / "does_not_exist_yet"
    monkeypatch.setattr(report_writer_module, "REPORTS_DIR", missing_dir)

    write_report(SAMPLE_RESULTS, mode="local")

    assert missing_dir.exists()
    assert len(list(missing_dir.glob("*.json"))) == 1
