import ScreenHeader from "./ScreenHeader";
import { FINDINGS } from "../lib/mock-api";

const fmtDate = value => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const statusClass = status =>
  status === "SUCCEEDED" ? "is-succeeded" : status === "FAILED" ? "is-failed" : "is-na";

const profit = value => `${Number(value || 0).toFixed(1)} ETH`;

function ChartSvg({ summary }) {
  const data = [
    ["SUCCEEDED", summary.succeeded, "coral"],
    ["BLOCKED", summary.failed, "mint"],
    ["NOT APPLICABLE", summary.not_applicable, "na"],
  ];

  return (
    <svg
      className="result-chart"
      viewBox="0 0 470 156"
      role="img"
      aria-labelledby="chartTitle chartDesc"
    >
      <title id="chartTitle">Attack result summary</title>
      <desc id="chartDesc">
        {data.map(([label, n]) => `${n} ${label.toLowerCase()}`).join(", ")} out of {summary.total} modules.
      </desc>
      {data.map(([label, n, color], i) => {
        const y = 22 + i * 45;
        const barWidth = Math.max(2, (300 * n) / Math.max(summary.total, 1));
        return (
          <g key={label}>
            <text
              x="0"
              y={y + 10}
              fill="#A8A8B0"
              fontFamily="IBMPlexMono,monospace"
              fontSize="9"
            >
              {label}
            </text>
            <line
              x1="148"
              y1={y + 6}
              x2="448"
              y2={y + 6}
              stroke="rgba(255,255,255,.11)"
              strokeWidth="1"
            />
            <rect
              x="148"
              y={y}
              width={barWidth}
              height="12"
              fill={`var(--${color})`}
            />
            <text
              x="458"
              y={y + 10}
              textAnchor="end"
              fill="#ECECEE"
              fontFamily="IBMPlexMono,monospace"
              fontSize="9"
            >
              {n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ReportScreen({ report, setState, showToast }) {
  if (!report) {
    return (
      <section className="screen">
        <ScreenHeader num="04" label="REPORT" right="NO REPORT SELECTED" />
        <div className="empty-state">
          <strong>NO REPORT SELECTED</strong>Run a local simulation or open a history row.
        </div>
        <a className="button" href="#/upload">
          START A CHECK →
        </a>
      </section>
    );
  }

  const summary = report.summary;
  const vulnerable = summary.succeeded > 0;
  const isReal = Boolean(report.is_real);
  const title = isReal
    ? (vulnerable
        ? `${summary.succeeded} OF ${summary.total} ATTACKS SUCCEEDED. CONTRACT IS VULNERABLE.`
        : `0 OF ${summary.total} ATTACKS SUCCEEDED. ALL ATTACKS BLOCKED.`)
    : (vulnerable
        ? `${summary.succeeded} OF ${summary.total} ATTACKS SUCCEEDED. CONTRACT IS VULNERABLE.`
        : `0 OF ${summary.total} ATTACKS SUCCEEDED. NO DEMO EXPLOIT WAS OBSERVED.`);

  const tag = isReal ? (
    <span className="demo-tag demo-tag--real">
      REAL ENGINE DATA <span aria-hidden="true">/</span> REAL SIMULATION
    </span>
  ) : (
    <span className="demo-tag">
      DEMO DATA <span aria-hidden="true">/</span> NOT A REAL SCAN
    </span>
  );

  const verdictNote = isReal
    ? `Real simulation results executed by DeFiSentinel attack modules on local execution fork.`
    : `Local sample outcomes illustrate possible report states only. They are not evidence about this uploaded contract and are not a professional audit.`;

  const handleRunAgain = () => {
    setState(prev => ({ ...prev, runRows: null, report: null }));
    window.location.hash = "/configure";
  };

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      showToast("Report JSON copied.");
    } catch {
      const text = JSON.stringify(report, null, 2);
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      showToast("Report JSON copied.");
    }
  };

  return (
    <section className="screen" aria-labelledby="screen-title">
      <ScreenHeader
        num="04"
        label="SIMULATION REPORT"
        right={`${report.report_id} / ${fmtDate(report.generated_at)}`}
      />
      <div className="report-top">
        <div className="report-title">
          {tag}
          <h1 id="screen-title" className="display display-small">
            {title}
          </h1>
        </div>
        <aside className="verdict-note">{verdictNote}</aside>
      </div>

      <div className="summary-grid" aria-label="Summary figures">
        <div className="summary-cell">
          <div className="summary-label">TOTAL MODULES</div>
          <div className="summary-value">{summary.total}</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">SUCCEEDED</div>
          <div className="summary-value is-coral">{summary.succeeded}</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">BLOCKED</div>
          <div className="summary-value is-mint">{summary.failed}</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">NOT APPLICABLE</div>
          <div className="summary-value is-na">{summary.not_applicable}</div>
        </div>
      </div>

      <div className="report-grid">
        <div>
          <div className="section-rule" style={{ marginBottom: 14 }}>
            ATTACK RESULTS
          </div>
          <div className="result-list">
            {report.results.map((result, i) => {
              const finding = FINDINGS[result.module];
              const findings =
                result.status === "SUCCEEDED" && finding ? (
                  <div className="finding-grid">
                    <section className="finding-panel">
                      <h4>WHAT WAS LACKING</h4>
                      <p>{finding.lacking}</p>
                    </section>
                    <section className="finding-panel">
                      <h4>SUGGESTED FIX</h4>
                      <p>{finding.fix}</p>
                    </section>
                  </div>
                ) : null;

              return (
                <article key={i} className="result-card">
                  <div className="result-card-head">
                    <div>
                      <span className="attack-index">ATTACK / 0{i + 1}</span>
                      <div className="result-name">{result.module}</div>
                      <div className="result-note">{result.note}</div>
                    </div>
                    <span className={`result-status ${statusClass(result.status)}`}>
                      {result.status}
                    </span>
                  </div>
                  <div className="profit-line">
                    ESTIMATED PROFIT <strong>{profit(result.profit_eth)}</strong>
                    <span className="muted">
                      {" "}
                      <span aria-hidden="true">/</span>{" "}
                      {Number(result.duration_s || 0).toFixed(1)} S
                    </span>
                  </div>
                  {findings}
                </article>
              );
            })}
          </div>
        </div>
        <aside>
          <div className="chart-panel">
            <h3>RESULT DISTRIBUTION</h3>
            <p className="chart-caption">
              Four modules <span aria-hidden="true">/</span> {isReal ? "real engine" : "sample-data"} status count
            </p>
            <ChartSvg summary={summary} />
            <div className="chart-key">
              <span>
                <i className="key-swatch coral"></i>SUCCEEDED
              </span>
              <span>
                <i className="key-swatch mint"></i>BLOCKED
              </span>
              <span>
                <i className="key-swatch na"></i>NOT APPLICABLE
              </span>
            </div>
          </div>
          <div className="report-actions">
            <button className="button" id="runAgain" type="button" onClick={handleRunAgain}>
              RUN AGAIN <span aria-hidden="true">↻</span>
            </button>
            <button className="button button-secondary" id="copyReport" type="button" onClick={handleCopyReport}>
              COPY REPORT AS JSON
            </button>
          </div>
          <p className="report-footnote">
            {isReal ? (
              <>REAL ENGINE RUN <span aria-hidden="true">/</span> LOCAL FORK TEST.</>
            ) : (
              <>PRE-LAUNCH CHECK <span aria-hidden="true">/</span> NOT A REPLACEMENT FOR A PROFESSIONAL AUDIT.</>
            )}
          </p>
        </aside>
      </div>
    </section>
  );
}
