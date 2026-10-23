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
      <nav className="step-nav" aria-label="Prototype steps">
        <a
          href="#/upload"
          data-step="upload"
          className={getStepClass("upload") || undefined}
          aria-current={activeRoute === "upload" ? "step" : undefined}
        >
          <span>01</span><b>UPLOAD</b>
        </a>
        <span className="step-rule" aria-hidden="true"></span>
        <a
          href="#/configure"
          data-step="configure"
          className={getStepClass("configure") || undefined}
          aria-current={activeRoute === "configure" ? "step" : undefined}
        >
          <span>02</span><b>CONFIGURE</b>
        </a>
        <span className="step-rule" aria-hidden="true"></span>
        <a
          href="#/running"
          data-step="running"
          className={getStepClass("running") || undefined}
          aria-current={activeRoute === "running" ? "step" : undefined}
        >
          <span>03</span><b>RUN</b>
        </a>
        <span className="step-rule" aria-hidden="true"></span>
        <a
          href="#/report"
          data-step="report"
          className={getStepClass("report") || undefined}
          aria-current={activeRoute === "report" ? "step" : undefined}
        >
          <span>04</span><b>REPORT</b>
        </a>
      </nav>
      <a className="history-link" href="#/history">
        <span className="history-dot" aria-hidden="true"></span>HISTORY
      </a>
    </header>
  );
}
