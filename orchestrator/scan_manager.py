"""Background scan jobs for the dashboard API.

A scan runs the selected attack modules (each against the selected variants) in a
worker thread, exposes live progress through snapshot(), and persists a report
through the same report_writer the CLI uses.

Only one scan may run at a time: Foundry shares its `out/` and `cache/`
directories, so concurrent builds would race.
"""

import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from orchestrator import engine
from orchestrator.config import MODULE_REGISTRY, DEFAULT_MODULES, DEFAULT_VARIANTS
from orchestrator.report_writer import write_report

MAX_FINISHED_SCANS = 20


class ScanBusyError(RuntimeError):
    """Raised when a scan is requested while another one is still running."""


class ScanManager:
    def __init__(
        self,
        run_single: Optional[Callable[..., Dict[str, Any]]] = None,
        ensure_built: Optional[Callable[[], None]] = None,
        report_writer: Optional[Callable[..., Any]] = None,
    ):
        # Injectable for tests so no real Foundry install is needed.
        self._run_single = run_single or engine.run_single
        self._ensure_built = ensure_built or engine.ensure_built
        self._write_report = report_writer or write_report
        self._lock = threading.Lock()
        self._scans: Dict[str, Dict[str, Any]] = {}
        self._cancel_flags: Dict[str, threading.Event] = {}
        self._threads: Dict[str, threading.Thread] = {}

    # ------------------------------------------------------------------ API
    def start(
        self,
        modules: Optional[List[str]] = None,
        variants: Optional[List[str]] = None,
        mode: str = "local",
        rpc_url: str = "",
        fork_block: str = "",
    ) -> str:
        modules = list(modules or DEFAULT_MODULES)
        variants = list(variants or DEFAULT_VARIANTS)
        unknown = [m for m in modules if m not in MODULE_REGISTRY]
        if unknown:
            raise ValueError(f"Unknown module(s): {', '.join(unknown)}")
        if not modules:
            raise ValueError("At least one module is required")
        bad = [v for v in variants if v not in ("vulnerable", "protected")]
        if bad or not variants:
            raise ValueError("variants must be a non-empty subset of vulnerable, protected")
        if mode not in ("local", "fork"):
            raise ValueError("mode must be 'local' or 'fork'")
        if mode == "fork" and not rpc_url:
            raise ValueError("Fork mode requires RPC_URL to be configured on the server")

        with self._lock:
            if any(s["status"] in ("queued", "building", "running") for s in self._scans.values()):
                raise ScanBusyError("A scan is already running")

            scan_id = uuid.uuid4().hex[:12]
            self._scans[scan_id] = {
                "id": scan_id,
                "status": "queued",
                "mode": mode,
                "variants": variants,
                "rows": [
                    {
                        "module": m,
                        "state": "QUEUED",
                        "progress": 0,
                        "elapsed_s": 0.0,
                        "results": [],
                    }
                    for m in modules
                ],
                "overall": 0,
                "elapsed_s": 0.0,
                "report_id": None,
                "error": None,
                "_started": time.monotonic(),
            }
            self._cancel_flags[scan_id] = threading.Event()
            thread = threading.Thread(
                target=self._work,
                args=(scan_id, modules, variants, mode, rpc_url, fork_block),
                name=f"scan-{scan_id}",
                daemon=True,
            )
            self._threads[scan_id] = thread
            self._prune_locked()
            thread.start()
            return scan_id

    def snapshot(self, scan_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            scan = self._scans.get(scan_id)
            if scan is None:
                return None
            snap = {k: v for k, v in scan.items() if not k.startswith("_")}
            if scan["status"] in ("queued", "building", "running"):
                snap["elapsed_s"] = round(time.monotonic() - scan["_started"], 2)
            snap["rows"] = [dict(r, results=list(r["results"])) for r in scan["rows"]]
            return snap

    def cancel(self, scan_id: str) -> bool:
        with self._lock:
            flag = self._cancel_flags.get(scan_id)
            scan = self._scans.get(scan_id)
            if flag is None or scan is None:
                return False
            if scan["status"] in ("queued", "building", "running"):
                flag.set()
            return True

    def join(self, scan_id: str, timeout: Optional[float] = None) -> None:
        """Block until the scan thread ends (used by tests)."""
        thread = self._threads.get(scan_id)
        if thread:
            thread.join(timeout)

    # ------------------------------------------------------------- internals
    def _prune_locked(self) -> None:
        finished = [
            sid for sid, s in self._scans.items()
            if s["status"] in ("done", "error", "cancelled")
        ]
        excess = len(finished) - MAX_FINISHED_SCANS
        for sid in finished[:max(excess, 0)]:
            self._scans.pop(sid, None)
            self._cancel_flags.pop(sid, None)
            self._threads.pop(sid, None)

    def _update(self, scan_id: str, fn: Callable[[Dict[str, Any]], None]) -> None:
        with self._lock:
            fn(self._scans[scan_id])

    def _work(self, scan_id, modules, variants, mode, rpc_url, fork_block) -> None:
        cancel = self._cancel_flags[scan_id]
        started = time.monotonic()
        all_results: List[Dict[str, Any]] = []
        total_steps = len(modules) * len(variants)
        done_steps = 0

        try:
            self._update(scan_id, lambda s: s.update(status="building"))
            self._ensure_built()
            self._update(scan_id, lambda s: s.update(status="running"))

            for mi, module in enumerate(modules):
                if cancel.is_set():
                    raise _Cancelled()
                self._update(scan_id, lambda s, mi=mi: s["rows"][mi].update(state="RUNNING"))
                module_started = time.monotonic()

                for variant in variants:
                    if cancel.is_set():
                        raise _Cancelled()
                    result = self._run_single(
                        module, variant, mode=mode, rpc_url=rpc_url, fork_block=fork_block
                    )
                    all_results.append(result)
                    done_steps += 1

                    def apply(s, mi=mi, result=result, module_started=module_started):
                        row = s["rows"][mi]
                        row["results"].append(result)
                        row["progress"] = round(100 * len(row["results"]) / len(variants))
                        row["elapsed_s"] = round(time.monotonic() - module_started, 2)
                        s["overall"] = round(100 * done_steps / total_steps)

                    self._update(scan_id, apply)

                self._update(
                    scan_id,
                    lambda s, mi=mi: s["rows"][mi].update(state="DONE", progress=100),
                )

            report_path = self._write_report(
                results=all_results,
                mode=mode,
                fork_block=fork_block if fork_block else None,
            )
            report_id = getattr(report_path, "stem", str(report_path))
            self._update(
                scan_id,
                lambda s: s.update(
                    status="done",
                    overall=100,
                    report_id=report_id,
                    elapsed_s=round(time.monotonic() - started, 2),
                ),
            )
        except _Cancelled:
            self._update(
                scan_id,
                lambda s: s.update(
                    status="cancelled", elapsed_s=round(time.monotonic() - started, 2)
                ),
            )
        except Exception as exc:  # surfaced to the UI instead of dying silently
            message = str(exc).strip() or exc.__class__.__name__
            self._update(
                scan_id,
                lambda s: s.update(
                    status="error",
                    error=message[:2000],
                    elapsed_s=round(time.monotonic() - started, 2),
                ),
            )


class _Cancelled(Exception):
    pass


# Process-wide instance used by dashboard/serve.py
manager = ScanManager()
