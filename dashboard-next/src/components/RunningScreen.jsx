import { useEffect, useRef, useState } from "react";
import ScreenHeader from "./ScreenHeader";
import { executeAnalysisScan } from "../lib/real-api";
import { ArrowLeft, SlidersHorizontal, AlertOctagon, AlertTriangle, ShieldCheck, Clock, Minus, Loader2, X } from "lucide-react";

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

const renderStatusIcon = (stateStr) => {
  switch ((stateStr || "").toUpperCase()) {
    case "EXPLOITED":
      return <AlertTriangle size={12} strokeWidth={2.2} style={{ color: "var(--coral)", marginRight: 5, flexShrink: 0 }} aria-hidden="true" />;
    case "BLOCKED":
      return <ShieldCheck size={12} strokeWidth={2.2} style={{ color: "var(--mint)", marginRight: 5, flexShrink: 0 }} aria-hidden="true" />;
    case "RUNNING":
      return <Loader2 size={12} strokeWidth={2.5} className="spin" style={{ color: "var(--mint)", marginRight: 5, flexShrink: 0 }} aria-hidden="true" />;
    case "QUEUED":
      return <Clock size={12} strokeWidth={2} style={{ color: "var(--muted)", marginRight: 5, flexShrink: 0 }} aria-hidden="true" />;
    default:
      return <Minus size={12} strokeWidth={2} style={{ color: "var(--muted)", marginRight: 5, flexShrink: 0 }} aria-hidden="true" />;
  }
};

export default function RunningScreen({ state, setState, showToast }) {
  const [overallElapsed, setOverallElapsed] = useState(0);
  const [stageMessage, setStageMessage] = useState("Initializing Foundry EVM execution...");
  const [errorMessage, setErrorMessage] = useState(null);
  const runningRef = useRef(false);

  const hasSource = Boolean(state.source && state.source.trim() && (state.fileName || "").trim());
  const rows = state.runRows || DEFAULT_ROWS;
  const pct = Math.round(state.overallProgress || 0);

  useEffect(() => {
    if (!hasSource) return;
    if (runningRef.current) return;
    runningRef.current = true;

    const controller = new AbortController();
    const startTime = performance.now();

    const timer = setInterval(() => {
      setOverallElapsed(((performance.now() - startTime) / 1000).toFixed(1));
    }, 100);

    setState(prev => ({
      ...prev,
      controller,
      runRows: DEFAULT_ROWS.map(r => ({ ...r, state: "RUNNING", progress: 25 })),
      overallProgress: 15,
      report: null, // Clear any previous report
    }));

    const promise = executeAnalysisScan({
      source: state.source,
      filename: state.fileName,
      protocol: state.protocol || "VAULT",
      roleMap: state.roleMap || {},
      constructorArgs: state.constructorArgs || "",
      holds: state.holds || {},
      signal: controller.signal,
      onProgress: ({ stage, overall, message }) => {
        setStageMessage(message);
        setState(prev => ({
          ...prev,
          overallProgress: overall,
        }));
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("defisentinel:progress", { detail: overall })
          );
        }
      },
    })
      .then(report => {
        clearInterval(timer);
        runningRef.current = false;
        const finalRows = (report.results || []).map(r => ({
          module: r.module,
          state: r.status === "SUCCEEDED" ? "EXPLOITED" : r.status === "NOT APPLICABLE" ? "N/A" : "BLOCKED",
          progress: 100,
          elapsed_s: r.duration_s || 0,
        }));

        setState(prev => ({
          ...prev,
          report,
          runRows: finalRows,
          overallProgress: 100,
          runPromise: null,
          controller: null,
        }));

        setTimeout(() => {
          window.location.hash = "/report";
        }, 300);
      })
      .catch(error => {
        clearInterval(timer);
        runningRef.current = false;
        setState(prev => ({
          ...prev,
          runPromise: null,
          controller: null,
          report: null, // Crucial: NEVER keep or show a report on failure
          overallProgress: 0,
        }));

        if (error.name === "AbortError") {
          showToast("Simulation cancelled. No contracts were touched.");
          window.location.hash = "/configure";
        } else {
          console.error("Analysis execution error:", error);
          setErrorMessage(error.message || "The Foundry simulation encountered an error.");
          showToast(error.message || "Simulation failed.");
        }
      });

    setState(prev => ({ ...prev, runPromise: promise }));

    return () => {
      clearInterval(timer);
    };
  }, [hasSource]);

  const handleCancel = () => {
    state.controller?.abort();
    setState(prev => ({ ...prev, controller: null, report: null }));
    showToast("Simulation cancelled.");
  };

  if (!hasSource) {
    return (
      <section className="screen" aria-labelledby="screen-title">
        <ScreenHeader num="03" label="RUNNING" />
        <div className="empty-state">
          <strong>NO CONTRACT INPUT</strong>
          Analysis cannot begin without an uploaded Solidity file. Please return to the upload step.
        </div>
        <a className="button" href="#/upload" style={{ marginTop: 20 }}>
          <ArrowLeft size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: "-2px" }} aria-hidden="true" />
          Go to Upload Screen
        </a>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="screen" aria-labelledby="screen-title">
        <ScreenHeader num="03" label="SIMULATION FAILED" />
        <div className="empty-state" style={{ borderColor: "var(--coral, #ff6b6b)" }}>
          <AlertOctagon size={24} strokeWidth={2} style={{ color: "var(--coral, #ff6b6b)", marginBottom: 8, display: "block" }} aria-hidden="true" />
          <strong style={{ color: "var(--coral, #ff6b6b)" }}>Simulation failed</strong>
          <pre style={{ textAlign: "left", whiteSpace: "pre-wrap", marginTop: 12, padding: 12, background: "rgba(0,0,0,0.4)", borderRadius: 4 }}>
            {errorMessage}
          </pre>
          <p style={{ marginTop: 12 }}>
            No report was generated. Resolve the error above and run the check again.
          </p>
        </div>
        <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
          <a className="button" href="#/upload">
            <ArrowLeft size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: "-2px" }} aria-hidden="true" />
            Edit Source
          </a>
          <a className="button button-secondary" href="#/configure">
            <SlidersHorizontal size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: "-2px" }} aria-hidden="true" />
            Reconfigure Roles
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="screen" aria-labelledby="screen-title">
      <ScreenHeader num="03" label="RUNNING" />
      <div className="running-head">
        <div>
          <div className="eyebrow micro tracked">
            Scanning {state.fileName || "Contract.sol"}
          </div>
          <h1 id="screen-title" className="display display-small">
            Simulating attack paths.
          </h1>
          <p className="micro" style={{ marginTop: 8, color: "var(--mint)", letterSpacing: "0.08em", display: "inline-flex", alignItems: "center" }}>
            <Loader2 size={12} strokeWidth={2.5} className="spin" style={{ marginRight: 6 }} aria-hidden="true" />
            {stageMessage}
          </p>
        </div>
        <div className="run-summary">
          <div style={{ fontSize: "28px", fontFamily: "var(--display)", color: "var(--text)" }}>
            <span id="overallProgress">{pct}</span>%
          </div>
          <div style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
            <span id="overallElapsed">{Number(overallElapsed).toFixed(1)}</span>s ELAPSED
          </div>
        </div>
      </div>
      <div className="attack-list" id="attackList">
        {rows.map((row, i) => (
          <div
            key={i}
            className="attack-row bracket-panel"
            style={{ marginBottom: "10px", padding: "16px 20px" }}
            data-attack={i}
            data-state={row.state.toLowerCase()}
          >
            <div>
              <span className="attack-index">{i + 1}</span>
              <div className="attack-name" style={{ fontWeight: 500 }}>{row.module}</div>
            </div>
            <div className="attack-status" style={{ display: "inline-flex", alignItems: "center" }}>
              {renderStatusIcon(row.state)}
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
          ISOLATED LOCAL ENVIRONMENT. NO EXTERNAL RPC USED.
        </span>
        <button
          className="button button-danger"
          id="cancelRun"
          type="button"
          onClick={handleCancel}
          title="Abort simulation and return to role configuration"
        >
          Abort <X size={14} strokeWidth={2.2} style={{ marginLeft: 5, verticalAlign: "-1px" }} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
