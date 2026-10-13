import { useState, useEffect } from "react";
import ScreenHeader from "./ScreenHeader";
import { getHistoryData, getReportById } from "../lib/mock-api";

const fmtDate = value => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export default function HistoryScreen({ setState }) {
  const [historyState, setHistoryState] = useState(() => {
    const local = getLocalHistory().map(r => ({ ...r, is_real: false }));
    local.sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));
    const apiStatus = getApiStatus();
    return {
      reports: local,
      isFallback: true,
      fallbackReason: apiStatus.empty
        ? "NO REAL ENGINE REPORTS FOUND (/api/reports returned empty). SHOWING DEMO DATA."
        : "REAL ENGINE DATA UNAVAILABLE (/api/reports request failed). SHOWING DEMO DATA.",
      loaded: false,
    };
  });

  useEffect(() => {
    let active = true;
    getHistoryData().then(({ reports, isFallback, fallbackReason }) => {
      if (!active) return;
      const sorted = [...reports].sort(
        (a, b) => new Date(b.generated_at) - new Date(a.generated_at)
      );
      setHistoryState({
        reports: sorted,
        isFallback,
        fallbackReason,
        loaded: true,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const openReport = (reportId) => {
    const report = getReportById(reportId);
    if (!report) return;
    setState(prev => ({ ...prev, report }));
    window.location.hash = "/report";
  };

  const { reports, isFallback, fallbackReason } = historyState;

  return (
    <section className="screen" aria-labelledby="screen-title">
      <ScreenHeader
        num="—"
        label="HISTORY"
        right={isFallback ? "DEMO DATA FALLBACK" : "LOCAL / ENGINE REPORTS"}
      />
      <div className="history-head">
        <div>
          <div className="eyebrow micro tracked">REPORT INDEX</div>
          <h1 id="screen-title" className="display display-small">
            Previous checks.
          </h1>
        </div>
        <span className="micro">
          {reports.length} REPORTS <span aria-hidden="true">/</span> CLICK A ROW TO OPEN
        </span>
      </div>
      {isFallback && fallbackReason ? (
        <div className="notice" role="status" style={{ marginTop: 16 }}>
          <span className="notice-mark">!</span>
          <span>{fallbackReason}</span>
        </div>
      ) : null}
      {reports.length ? (
        <div
          className="table-wrap"
          role="region"
          aria-label="Previous reports"
          tabIndex={0}
        >
          <table className="history-table">
            <thead>
              <tr>
                <th scope="col">REPORT ID</th>
                <th scope="col">DATE</th>
                <th scope="col">TARGET</th>
                <th scope="col">MODE</th>
                <th scope="col">SUCCEEDED</th>
                <th scope="col">OPEN</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((item) => (
                <tr
                  key={item.report_id}
                  data-report-id={item.report_id}
                  tabIndex={0}
                  aria-label={`Open ${item.is_real ? "real" : "demo"} report ${item.report_id} for ${item.target}`}
                  onClick={() => openReport(item.report_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openReport(item.report_id);
                    }
                  }}
                >
                  <td className="report-id">{item.report_id}</td>
                  <td>{fmtDate(item.generated_at)}</td>
                  <td className="target-cell">{item.target}</td>
                  <td>
                    {item.mode.toUpperCase()}
                    <span className={item.is_real ? "table-real" : "table-demo"}>
                      / {item.is_real ? "REAL ENGINE DATA" : "DEMO DATA"}
                    </span>
                  </td>
                  <td className="count-succeeded">
                    {item.summary.succeeded}{" "}
                    <span className="muted">/ {item.summary.total}</span>
                  </td>
                  <td aria-hidden="true">→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <strong>NO REPORTS YET</strong>Run a local simulation to create the first report.
        </div>
      )}
      <p className="micro" style={{ marginTop: 15 }}>
        REAL ENGINE REPORTS ARE FETCHED FROM LOCAL ENGINE (/api/reports). DEMO SAMPLE REPORTS ARE STORED LOCALLY.
      </p>
    </section>
  );
}
