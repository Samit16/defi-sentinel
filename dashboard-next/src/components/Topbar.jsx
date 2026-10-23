import { Check, History } from "lucide-react";

const ROUTES = ["upload", "configure", "running", "report"];

export default function Topbar({ activeRoute }) {
  const currentIdx = ROUTES.indexOf(activeRoute);

  const getStepClass = (step) => {
    const isAct = step === activeRoute;
    const isDone = ROUTES.indexOf(step) >= 0 && ROUTES.indexOf(step) < currentIdx;
    return [isAct ? "active" : "", isDone ? "done" : ""].filter(Boolean).join(" ");
  };

  return (
    <header className="topbar">
      <a className="wordmark" href="#/" aria-label="DeFiSentinel home">
        <span className="wordmark-mark" aria-hidden="true">D<span>·</span>S</span>
        <span>DEFISENTINEL</span>
      </a>
      <nav className="step-nav" aria-label="Workflow progress">
        {[
          { key: "upload", num: "01", label: "Upload" },
          { key: "configure", num: "02", label: "Configure" },
          { key: "running", num: "03", label: "Run" },
          { key: "report", num: "04", label: "Report" }
        ].map((step, idx) => {
          const isAct = step.key === activeRoute;
          const isDone = currentIdx >= 0 && idx < currentIdx;
          const isNext = currentIdx >= 0 && idx === currentIdx + 1;
          const statusText = isDone ? "Completed" : isAct ? "In Progress" : isNext ? "Next" : "Upcoming";

          return (
            <span key={step.key} className="step-item-wrap">
              {idx > 0 && <span className={`step-rule ${isDone ? "is-done" : ""}`} aria-hidden="true"></span>}
              <a
                href={`#/${step.key}`}
                data-step={step.key}
                className={`step-link ${isAct ? "active" : ""} ${isDone ? "done" : ""}`}
                aria-current={isAct ? "step" : undefined}
                title={`Stage ${step.num}: ${step.label} (${statusText})`}
              >
                <span className="step-badge" aria-hidden="true">
                  {isDone ? <Check size={11} strokeWidth={2.5} aria-hidden="true" /> : step.num}
                </span>
                <span className="step-label-group">
                  <b>{step.label}</b>
                  <small className="step-state-tag">{statusText}</small>
                </span>
              </a>
            </span>
          );
        })}
      </nav>
      <a className="history-link" href="#/history" title="View past scan records" aria-label="Scan history">
        <History size={13} strokeWidth={2} className="history-icon" aria-hidden="true" style={{ marginRight: 6 }} />
        <span>History</span>
      </a>
    </header>
  );
}
