/**
 * Adapter and API client for real DeFiSentinel engine reports.
 * Interfaces with Flask backend endpoints:
 *   GET /api/reports
 *   GET /api/reports/<id>
 */

export const MODULE_NAME_MAP = {
  reentrancy: "Reentrancy",
  oracle: "Oracle Manipulation",
  flash_loan: "Flash Loan",
  governance: "Governance Takeover",
};

/**
 * Maps a single real engine result item into the UI result structure:
 * { module, status, profit_eth, note, duration_s }
 */
export function adaptResult(raw) {
  const displayModule = MODULE_NAME_MAP[raw.module] || raw.module || "Unknown Module";
  return {
    module: displayModule,
    variant: raw.variant || undefined,
    status: raw.status || "FAILED",
    profit_eth: typeof raw.profit_eth === "number" ? raw.profit_eth : 0,
    note: raw.note || "",
    duration_s: typeof raw.duration_s === "number" ? raw.duration_s : 0,
  };
}

export const REAL_TARGET_LABEL = "Built-in reference targets";

const summarise = results => ({
  total: results.length,
  succeeded: results.filter(x => x.status === "SUCCEEDED").length,
  failed: results.filter(x => x.status === "FAILED").length,
  not_applicable: results.filter(x => x.status === "NOT APPLICABLE").length,
});

/**
 * Converts a real engine report into ONE UI report that keeps every result's
 * variant, so the report view can show vulnerable vs protected side by side.
 * Returned as an array to keep the original call-site contract.
 */
export function adaptRealReport(rawReport) {
  const results = Array.isArray(rawReport.results) ? rawReport.results : [];
  if (results.length === 0) return [];
  const adapted = results.map(adaptResult);
  return [{
    report_id: rawReport.report_id || rawReport.id || "Report",
    generated_at: rawReport.generated_at || new Date().toISOString(),
    mode: rawReport.mode || "local",
    fork_block: rawReport.fork_block ?? null,
    target: REAL_TARGET_LABEL,
    is_real: true,
    summary: summarise(adapted),
    results: adapted,
  }];
}

// In-memory cache for all real reports fetched, keyed by UI report_id
export const realReportsCache = new Map();

let lastApiStatus = {
  attempted: false,
  failed: false,
  empty: false,
  count: 0,
};

export function getApiStatus() {
  return lastApiStatus;
}

/**
 * Fetches reports from GET /api/reports and full reports from GET /api/reports/<id>,
 * adapts them into UI format, caches them in realReportsCache, and returns the array.
 */
export async function fetchRealEngineReports() {
  try {
    const listRes = await fetch("/api/reports");
    if (!listRes.ok) {
      lastApiStatus = { attempted: true, failed: true, empty: false, count: 0 };
      return [];
    }
    const summaries = await listRes.json();
    if (!Array.isArray(summaries) || summaries.length === 0) {
      lastApiStatus = { attempted: true, failed: false, empty: true, count: 0 };
      return [];
    }

    // Exclude mock sample file if flagged by server
    const realSummaries = summaries.filter(s => !s.is_sample);
    if (realSummaries.length === 0) {
      lastApiStatus = { attempted: true, failed: false, empty: true, count: 0 };
      return [];
    }

    const fetchedDetails = await Promise.all(
      realSummaries.map(async s => {
        try {
          const detailRes = await fetch(`/api/reports/${encodeURIComponent(s.id)}`);
          if (!detailRes.ok) return null;
          return await detailRes.json();
        } catch {
          return null;
        }
      })
    );

    const adaptedReports = [];
    for (const detail of fetchedDetails) {
      if (!detail) continue;
      const splitList = adaptRealReport(detail);
      for (const rep of splitList) {
        realReportsCache.set(rep.report_id, rep);
        adaptedReports.push(rep);
      }
    }

    const isEmpty = adaptedReports.length === 0;
    lastApiStatus = {
      attempted: true,
      failed: false,
      empty: isEmpty,
      count: adaptedReports.length,
    };
    return adaptedReports;
  } catch (err) {
    console.warn("Unable to fetch real reports from /api/reports:", err);
    lastApiStatus = { attempted: true, failed: true, empty: false, count: 0 };
    return [];
  }
}

/** Returns true when the Flask server reports a usable Foundry install. */
export async function checkEngineAvailable() {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) return false;
    const body = await res.json();
    return Boolean(body.engine_available);
  } catch {
    return false;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const POLL_MS = 350;

/**
 * Starts a real scan (POST /api/scans), polls GET /api/scans/<id> and reports
 * progress in the same snapshot shape the running view already renders:
 *   { rows: [{module, state, progress, elapsed_s}], overall, elapsed_s }
 * Resolves with the adapted UI report once the engine has written it.
 */
export async function runRealScan({ onUpdate = () => {}, signal } = {}) {
  const start = await fetch("/api/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modules: "all", variant: "both", mode: "local" }),
  });
  const startBody = await start.json().catch(() => ({}));
  if (!start.ok) {
    throw new Error(startBody.error || `Scan could not be started (HTTP ${start.status})`);
  }
  const scanId = startBody.id;

  const cancel = () => fetch(`/api/scans/${encodeURIComponent(scanId)}/cancel`, { method: "POST" }).catch(() => {});
  if (signal) signal.addEventListener("abort", cancel, { once: true });

  try {
    let finalSnap = null;
    for (;;) {
      if (signal?.aborted) throw new DOMException("Simulation cancelled", "AbortError");
      const res = await fetch(`/api/scans/${encodeURIComponent(scanId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Lost contact with the engine (HTTP ${res.status})`);
      const snap = await res.json();

      onUpdate({
        rows: snap.rows.map(row => ({
          module: MODULE_NAME_MAP[row.module] || row.module,
          state: snap.status === "building" ? "QUEUED" : row.state,
          progress: row.progress,
          elapsed_s: row.elapsed_s,
        })),
        overall: snap.overall,
        elapsed_s: snap.elapsed_s,
        status: snap.status,
      });

      if (snap.status === "done") { finalSnap = snap; break; }
      if (snap.status === "cancelled") throw new DOMException("Simulation cancelled", "AbortError");
      if (snap.status === "error") throw new Error(snap.error || "The engine reported an error");
      await sleep(POLL_MS);
    }

    const reportRes = await fetch(`/api/reports/${encodeURIComponent(finalSnap.report_id)}`);
    if (!reportRes.ok) throw new Error("The scan finished but its report could not be loaded");
    const [report] = adaptRealReport(await reportRes.json());
    if (!report) throw new Error("The scan finished but produced no results");
    realReportsCache.set(report.report_id, report);
    return report;
  } finally {
    signal?.removeEventListener?.("abort", cancel);
  }
}
