import { useState, useEffect } from "react";
import ScreenHeader from "./ScreenHeader";
import { fetchRealEngineReports, realReportsCache } from "../lib/real-api";

const fmtDate = value => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export default function HistoryScreen({ setState }) {
  const [historyState, setHistoryState] = useState({
    reports: [],
    loaded: false,
    error: null,
  });

  useEffect(() => {
    let active = true;
    fetchRealEngineReports()
      .then(reports => {
        if (!active) return;
        const sorted = [...reports].sort(
          (a, b) => new Date(b.generated_at) - new Date(a.generated_at)
        );
        setHistoryState({
          reports: sorted,
          loaded: true,
          error: null,
        });
      })
      .catch(err => {
        if (!active) return;
        setHistoryState({
          reports: [],
          loaded: true,
          error: "Failed to load reports from backend engine (/api/reports).",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const openReport = (reportId) => {
    const report = realReportsCache.get(reportId);
    if (!report) return;
    setState(prev => ({ ...prev, report }));
    window.location.hash = "/report";
  };

  const { reports, loaded, error } = historyState;

  return (
    <section className="screen" aria-labelledby="screen-title">
      <ScreenHeader
        num="—"
        label="HISTORY"
        right="FOUNDRY ENGINE REPORTS"
      />
      <div className="history-head">
        <div>
          <div className="eyebrow micro tracked">REPORT INDEX</div>
          <h1 id="screen-title" className="display display-small">
            Previous checks.
          </h1>
        </div>
        <span className="micro">
          {reports.length} REAL REPORTS <span aria-hidden="true">/</span> CLICK A ROW TO OPEN
        </span>
      </div>

      {error ? (
        <div className="notice" role="alert" style={{ marginTop: 16 }}>
          <span className="notice-mark">!</span>
          <span>{error}</span>
        </div>
      ) : null}

      {!loaded ? (
        <div className="empty-state">
          <strong>LOADING HISTORY...</strong>Fetching execution records from local engine.
        </div>
      ) : reports.length ? (
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
                <th scope="col">EXPLOITED</th>
                <th scope="col">OPEN</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((item) => (
                <tr
                  key={item.report_id}
                  data-report-id={item.report_id}
                  tabIndex={0}
                  aria-label={`Open real report ${item.report_id} for ${item.target}`}
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
                  <td className="target-cell">{item.target || "UploadedContract.sol"}</td>
                  <td>
                    {(item.mode || "local").toUpperCase()}
                    <span className="table-real">
                      / REAL ENGINE DATA
                    </span>
                  </td>
                  <td className="count-succeeded">
                    {item.summary?.succeeded || 0}{" "}
                    <span className="muted">/ {item.summary?.total || 0}</span>
                  </td>
                  <td aria-hidden="true">→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <strong>NO REPORTS YET</strong>Run a security simulation to create the first report.
        </div>
      )}
      <p className="micro" style={{ marginTop: 15 }}>
        REAL ENGINE REPORTS ARE PERSISTED IN reports/ AND FETCHED DIRECTLY VIA /api/reports.
      </p>
    </section>
  );
}
