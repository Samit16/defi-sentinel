import { useEffect, useRef, useState } from "react";
import ScreenHeader from "./ScreenHeader";
import { runFakeScan, saveReport } from "../lib/mock-api";

const DEFAULT_ROWS = [
  "Reentrancy",
  "Oracle Manipulation",
  "Flash Loan",
  "Governance Takeover"
].map(module => ({
  module,
  state: "QUEUED",
  progress: 0,
  elapsed_s: 0
}));

export default function RunningScreen({ state, setState, showToast }) {
  const [overallElapsed, setOverallElapsed] = useState(0);
  const runningRef = useRef(false);

  const rows = state.runRows || DEFAULT_ROWS;
  const pct = Math.round(state.overallProgress || 0);

  useEffect(() => {
    if (runningRef.current || state.runPromise) return;
    runningRef.current = true;

    const controller = new AbortController();
    setState(prev => ({
      ...prev,
      controller,
      runRows: null,
      overallProgress: 0,
    }));

    const promise = runFakeScan({
      target: state.fileName || "PastedContract.sol",
      protocol: state.protocol,
      onUpdate: (snapshot) => {
        setOverallElapsed(snapshot.elapsed_s || 0);
        setState(prev => ({
          ...prev,
          runRows: snapshot.rows,
          overallProgress: snapshot.overall,
        }));
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("defisentinel:progress", { detail: snapshot.overall })
          );
        }
      },
      signal: controller.signal,
    })
      .then(report => {
        saveReport(report);
        setState(prev => ({
          ...prev,
          report,
          runRows: null,
          overallProgress: 0,
          runPromise: null,
          controller: null,
        }));
        if (window.location.hash.replace(/^#\/?/, "").split("?")[0] === "running") {
          window.location.hash = "/report";
        }
      })
      .catch(error => {
        setState(prev => ({
          ...prev,
          runPromise: null,
          controller: null,
          runRows: null,
          overallProgress: 0,
        }));
        if (error.name === "AbortError") {
          setState(prev => ({ ...prev, report: null }));
          if (window.location.hash.replace(/^#\/?/, "").split("?")[0] === "running") {
            window.location.hash = "/configure";
          }
        } else {
          console.error(error);
          showToast("The local simulation could not finish.");
        }
      });

    setState(prev => ({ ...prev, runPromise: promise }));

    return () => {
      // Cleanup on unmount if user navigates away
      runningRef.current = false;
    };
  }, []);

  const handleCancel = () => {
    state.controller?.abort();
    setState(prev => ({ ...prev, controller: null }));
    showToast("Simulation cancelled. No chain or contract was touched.");
  };

  return (
    <section className="screen" aria-labelledby="screen-title">
      <ScreenHeader num="03" label="SIMULATION RUN" right="LOCAL MOCK ENGINE" />
      <div className="running-head">
        <div>
          <div className="eyebrow micro tracked">
            SAFE COPY <span aria-hidden="true">/</span> NO CHAIN CONNECTION
          </div>
          <h1 id="screen-title" className="display display-small">
            Four attack paths.
          </h1>
        </div>
        <div className="run-summary">
          <span id="overallProgress">{pct}</span>% COMPLETE<br />
          <span id="overallElapsed">{Number(overallElapsed).toFixed(1)}</span> S ELAPSED
        </div>
      </div>
      <div className="attack-list" id="attackList">
        {rows.map((row, i) => (
          <div
            key={i}
            className="attack-row"
            data-attack={i}
            data-state={row.state.toLowerCase()}
          >
            <div>
              <span className="attack-index">MODULE / 0{i + 1}</span>
              <div className="attack-name">{row.module}</div>
            </div>
            <div className="attack-status">
              <span className="status-dot" aria-hidden="true"></span>
              <span className="state-label">{row.state}</span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label={`${row.module} progress`}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(row.progress)}
            >
              <div
                className="progress-bar"
                style={{ width: `${Math.round(row.progress)}%` }}
              ></div>
            </div>
            <div className="elapsed">{Number(row.elapsed_s || 0).toFixed(1)} S</div>
          </div>
        ))}
      </div>
      <div className="run-footer">
        <span className="run-footnote">
          DEMO DATA <span aria-hidden="true">/</span> THIS TIMELINE IS SIMULATED. NO CONTRACT BYTECODE IS RUN.
        </span>
        <button
          className="button button-danger"
          id="cancelRun"
          type="button"
          onClick={handleCancel}
        >
          CANCEL <span aria-hidden="true">×</span>
        </button>
      </div>
    </section>
  );
}
