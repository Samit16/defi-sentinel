import ScreenHeader from "./ScreenHeader";
import { FINDINGS } from "../lib/real-api";

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
    ["SUCCEEDED", summary.succeeded || 0, "coral"],
    ["BLOCKED", summary.failed || 0, "mint"],
    ["NOT APPLICABLE", summary.not_applicable || 0, "na"],
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
        <a className="button" href="#/upload" style={{ marginTop: 20 }}>
          START A CHECK →
        </a>
      </section>
    );
  }

  const summary = report.summary || { total: 0, succeeded: 0, failed: 0 };
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
      SAMPLE DATA <span aria-hidden="true">/</span> NOT A REAL SCAN
    </span>
  );

  const verdictNote = isReal
    ? `Real atomic simulations executed by DeFiSentinel attack harnesses on local Foundry EVM.`
    : `Local sample outcomes illustrate possible report states only. They are not evidence about this uploaded contract.`;

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
          {report.target && (
            <div className="micro tracked" style={{ margin: "6px 0 2px", color: "rgba(255,255,255,0.7)" }}>
              TARGET: <strong>{report.target}</strong>
              {report.target_hash ? ` · SHA: ${report.target_hash.slice(0, 10)}...` : ""}
            </div>
          )}
          <h1 id="screen-title" className="display display-small">
            {title}
          </h1>
        </div>
        <aside className="verdict-note">{verdictNote}</aside>
      </div>

      {report.compiler_warnings && report.compiler_warnings.length > 0 ? (
        <div className="notice" style={{ margin: "14px 0" }}>
          <span className="notice-mark">i</span>
          <div>
            <strong>Compiler & Linter Diagnostics:</strong>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {report.compiler_warnings.slice(0, 4).map((w, idx) => (
                <li key={idx} style={{ fontSize: "11px", fontFamily: "monospace" }}>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

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
          <div className="summary-value is-na">{summary.not_applicable || 0}</div>
        </div>
      </div>

      <div className="report-grid">
        <div>
          <div className="section-rule" style={{ marginBottom: 16 }}>
            ATTACK VECTOR FINDINGS &amp; REMEDIATION ({report.results?.length || 0} SIMULATED VECTORS)
          </div>
          <div className="result-list">
            {(report.results || []).map((result, i) => {
              const finding = FINDINGS[result.module];
              const isExploited = result.status === "SUCCEEDED";
              const isBlocked = result.status === "FAILED";
              const severity = isExploited ? (result.module === "Reentrancy" ? "CRITICAL" : "HIGH") : isBlocked ? "LOW / MITIGATED" : "INFO";
              const severityColor = isExploited ? "var(--coral)" : isBlocked ? "var(--mint)" : "var(--na)";

              return (
                <article key={i} className={`result-card bracket-panel ${isExploited ? "is-exploited" : ""}`} style={{ marginBottom: 14, padding: "18px 22px" }}>
                  <div className="result-card-head">
                    <div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: 6 }}>
                        <span className="attack-index">ATTACK VECTOR / 0{i + 1}</span>
                        <span className="severity-pill" style={{ color: severityColor, borderColor: severityColor }}>
                          {severity}
                        </span>
                      </div>
                      <h3 className="result-name" style={{ margin: "2px 0 6px", fontSize: "17px" }}>{result.module}</h3>
                      <div className="result-note" style={{ fontSize: "13px", color: "var(--soft)", lineHeight: 1.5 }}>
                        <strong>Simulation Outcome:</strong> {result.note || (isExploited ? "Attack sequence successfully extracted contract funds." : "State invariant held. Attack transaction reverted.")}
                      </div>
                    </div>
                    <span className={`result-status ${statusClass(result.status)}`}>
                      {isExploited ? "✕ EXPLOITED" : isBlocked ? "✓ BLOCKED" : "— N/A"}
                    </span>
                  </div>

                  <div className="result-evidence-bar" style={{ display: "flex", flexWrap: "wrap", gap: "18px", margin: "14px 0", padding: "10px 14px", background: "rgba(0,0,0,0.35)", border: "1px solid var(--line)" }}>
                    <div style={{ fontSize: "11px", fontFamily: "var(--mono)" }}>
                      <span style={{ color: "var(--muted)" }}>EXTRACTED VALUE: </span>
                      <strong style={{ color: isExploited ? "var(--coral)" : "var(--text)" }}>{profit(result.profit_eth)}</strong>
                    </div>
                    <div style={{ fontSize: "11px", fontFamily: "var(--mono)" }}>
                      <span style={{ color: "var(--muted)" }}>EXECUTION DURATION: </span>
                      <span>{Number(result.duration_s || 0).toFixed(2)}s</span>
                    </div>
                    <div style={{ fontSize: "11px", fontFamily: "var(--mono)" }}>
                      <span style={{ color: "var(--muted)" }}>TEST ENVIRONMENT: </span>
                      <span>{isReal ? "Foundry EVM Local Fork" : "Sample Attack Harness"}</span>
                    </div>
                  </div>

                  {isExploited && finding && (
                    <div className="finding-grid" style={{ marginTop: 14 }}>
                      <section className="finding-panel" style={{ borderLeft: "2px solid var(--coral)" }}>
                        <h4 style={{ color: "var(--coral)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>⚠</span> VULNERABILITY MECHANISM
                        </h4>
                        <p>{finding.lacking}</p>
                      </section>
                      <section className="finding-panel" style={{ borderLeft: "2px solid var(--mint)" }}>
                        <h4 style={{ color: "var(--mint)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>✓</span> ACTIONABLE REMEDIATION
                        </h4>
                        <p>{finding.fix}</p>
                      </section>
                    </div>
                  )}

                  {isBlocked && (
                    <div className="mitigation-note" style={{ padding: "10px 14px", background: "rgba(77,240,168,0.05)", borderLeft: "2px solid var(--mint)", marginTop: 10, fontSize: "12px", color: "#B3C4BB" }}>
                      ✓ Contract properly enforces state guards and reverts this simulated exploitation sequence.
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <aside>
          <div className="chart-panel bracket-panel">
            <h3>SIMULATION DISTRIBUTION</h3>
            <p className="chart-caption">
              Four standardized vectors <span aria-hidden="true">/</span> {isReal ? "Verified Engine Run" : "Sample Reference Run"}
            </p>
            <ChartSvg summary={summary} />
            <div className="chart-key">
              <span>
                <i className="key-swatch coral"></i>SUCCEEDED ({summary.succeeded})
              </span>
              <span>
                <i className="key-swatch mint"></i>BLOCKED ({summary.failed})
              </span>
              <span>
                <i className="key-swatch na"></i>NOT APPLICABLE ({summary.not_applicable || 0})
              </span>
            </div>
          </div>

          <div className="trust-panel bracket-panel" style={{ marginTop: 16, padding: "16px 18px", fontSize: "12px", lineHeight: 1.55 }}>
            <div className="field-label" style={{ marginBottom: 6, color: "var(--mint)" }}>
              TRANSPARENCY &amp; LIMITATIONS
            </div>
            <p style={{ margin: "0 0 8px", color: "var(--soft)" }}>
              {isReal ? (
                <>
                  Results represent atomic state changes executed by DeFi Sentinel test harnesses on a local Foundry EVM. Gas limits, private mempool transactions, and cross-contract multi-block conditions outside simulated parameters may differ on live public networks.
                </>
              ) : (
                <>
                  Simulated preview data. Pre-launch checks provide automated regression testing against common attack patterns and do not replace a full manual security audit by certified smart contract auditors.
                </>
              )}
            </p>
            <div style={{ fontSize: "10px", fontFamily: "var(--mono)", color: "var(--muted)" }}>
              ENGINE: FOUNDRY FORGE · EVM SHANGHAI COMPLIANT
            </div>
          </div>

          <div className="report-actions">
            <button className="button" id="runAgain" type="button" onClick={handleRunAgain}>
              RUN NEW CHECK <span aria-hidden="true">↻</span>
            </button>
            <button className="button button-secondary" id="copyReport" type="button" onClick={handleCopyReport}>
              EXPORT JSON REPORT
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
