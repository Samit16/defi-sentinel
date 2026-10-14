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
    status: raw.status || "FAILED",
    profit_eth: typeof raw.profit_eth === "number" ? raw.profit_eth : 0,
    note: raw.note || "",
    duration_s: typeof raw.duration_s === "number" ? raw.duration_s : 0,
  };
}

/**
 * Splits a real report into two UI reports:
 * "<report_id> / vulnerable variant" and "<report_id> / protected variant",
 * with 4 results each and calculated summary counts.
 */
export function adaptRealReport(rawReport) {
  const results = Array.isArray(rawReport.results) ? rawReport.results : [];
  const baseId = rawReport.report_id || rawReport.id || "Report";
  const generatedAt = rawReport.generated_at || new Date().toISOString();
  const mode = rawReport.mode || "local";

  const vulnerableRaw = results.filter(r => r.variant === "vulnerable");
  const protectedRaw = results.filter(r => r.variant === "protected");

  const uiReports = [];

  const buildUiReport = (variantName, rawList) => {
    const adaptedResults = rawList.map(adaptResult);
    return {
      report_id: `${baseId} / ${variantName} variant`,
      generated_at: generatedAt,
      mode: mode,
      target: `${variantName} variant`,
      is_real: true,
      summary: {
        total: adaptedResults.length,
        succeeded: adaptedResults.filter(x => x.status === "SUCCEEDED").length,
        failed: adaptedResults.filter(x => x.status === "FAILED").length,
        not_applicable: adaptedResults.filter(x => x.status === "NOT APPLICABLE").length,
      },
      results: adaptedResults,
    };
  };

  if (vulnerableRaw.length > 0) {
    uiReports.push(buildUiReport("vulnerable", vulnerableRaw));
  }

  if (protectedRaw.length > 0) {
    uiReports.push(buildUiReport("protected", protectedRaw));
  }

  // Fallback if results did not contain variant markers
  if (vulnerableRaw.length === 0 && protectedRaw.length === 0 && results.length > 0) {
    const adaptedResults = results.map(adaptResult);
    uiReports.push({
      report_id: baseId,
      generated_at: generatedAt,
      mode: mode,
      target: "engine scan",
      is_real: true,
      summary: {
        total: adaptedResults.length,
        succeeded: adaptedResults.filter(x => x.status === "SUCCEEDED").length,
        failed: adaptedResults.filter(x => x.status === "FAILED").length,
        not_applicable: adaptedResults.filter(x => x.status === "NOT APPLICABLE").length,
      },
      results: adaptedResults,
    });
  }

  return uiReports;
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
