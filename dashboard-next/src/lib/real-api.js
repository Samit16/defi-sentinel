/**
 * Adapter and API client for real DeFiSentinel engine reports and scans.
 * Interfaces with Flask backend endpoints:
 *   POST /api/validate
 *   POST /api/scan
 *   GET  /api/reports
 *   GET  /api/reports/<id>
 */

export const MODULE_NAME_MAP = {
  reentrancy: "Reentrancy",
  oracle: "Oracle Manipulation",
  flash_loan: "Flash Loan",
  governance: "Governance Takeover",
};

export const FINDINGS = {
  "Reentrancy": {
    lacking: "The contract makes an external call before updating internal balances or state (checks-effects-interactions violation).",
    fix: "Update internal state before performing external calls, or inherit and apply a nonReentrant mutex lock."
  },
  "Oracle Manipulation": {
    lacking: "Collateral is valued directly against an instantaneous AMM spot price susceptible to single-block liquidity distortion.",
    fix: "Integrate a multi-block Time-Weighted Average Price (TWAP) and enforce a strict deviation circuit breaker (e.g. 5%)."
  },
  "Flash Loan": {
    lacking: "Intra-transaction price manipulation can be executed without capital risk using uncollateralized flash loans.",
    fix: "Combine TWAP price sanity bounds with intra-block transaction limits to prevent atomic pump-and-dump arbitrage."
  },
  "Governance Takeover": {
    lacking: "Voting power is determined by real-time token balances, allowing flash-borrowed voting power to pass proposals.",
    fix: "Measure voting weight from historical checkpoint snapshots (e.g. block.number - 1) and require a voting delay."
  }
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
 * Normalizes a single-scan report (from /api/scan) into the canonical UI report format.
 */
export function adaptScanReport(rawReport) {
  if (!rawReport) return null;
  const results = Array.isArray(rawReport.results) ? rawReport.results.map(adaptResult) : [];
  const baseId = rawReport.report_id || rawReport.id || "Report";
  const target = rawReport.target || "UploadedContract.sol";
  const succeeded = results.filter(x => x.status === "SUCCEEDED").length;
  const failed = results.filter(x => x.status === "FAILED").length;
  const not_applicable = results.filter(x => x.status === "NOT APPLICABLE").length;

  return {
    report_id: baseId,
    generated_at: rawReport.generated_at || new Date().toISOString(),
    mode: rawReport.mode || "local",
    target: target,
    target_hash: rawReport.target_hash || null,
    is_real: true,
    summary: {
      total: results.length,
      succeeded,
      failed,
      not_applicable,
    },
    results,
    compiler_warnings: rawReport.compiler_warnings || [],
  };
}

/**
 * Splits a benchmark multi-variant report into two UI reports:
 * "<report_id> / vulnerable variant" and "<report_id> / protected variant".
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
      target: rawReport.target || `${variantName} variant`,
      target_hash: rawReport.target_hash || null,
      is_real: true,
      summary: {
        total: adaptedResults.length,
        succeeded: adaptedResults.filter(x => x.status === "SUCCEEDED").length,
        failed: adaptedResults.filter(x => x.status === "FAILED").length,
        not_applicable: adaptedResults.filter(x => x.status === "NOT APPLICABLE").length,
      },
      results: adaptedResults,
      compiler_warnings: rawReport.compiler_warnings || [],
    };
  };

  if (vulnerableRaw.length > 0) {
    uiReports.push(buildUiReport("vulnerable", vulnerableRaw));
  }

  if (protectedRaw.length > 0) {
    uiReports.push(buildUiReport("protected", protectedRaw));
  }

  // Single-target run (e.g. uploaded contract)
  if (vulnerableRaw.length === 0 && protectedRaw.length === 0 && results.length > 0) {
    uiReports.push(adaptScanReport(rawReport));
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
 * Validates Solidity source code via backend POST /api/validate.
 */
export async function validateSoliditySource({ file, source, filename }) {
  let response;
  if (file instanceof File || file instanceof Blob) {
    const formData = new FormData();
    formData.append("file", file, filename || file.name || "contract.sol");
    response = await fetch("/api/validate", {
      method: "POST",
      body: formData,
    });
  } else {
    response = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: source || "",
        filename: filename || "contract.sol",
      }),
    });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data.details
      ? `${data.error || "Validation error"}:\n${data.details}`
      : (data.error || "Validation failed.");
    const err = new Error(errorMsg);
    err.code = data.code || "VALIDATION_FAILED";
    err.details = data.details || "";
    err.status = response.status;
    throw err;
  }
  return data;
}

/**
 * Executes a real security simulation scan via backend POST /api/scan.
 */
export async function executeAnalysisScan({
  file,
  source,
  filename,
  protocol = "VAULT",
  roleMap = {},
  constructorArgs = "",
  holds = null,
  mode = "local",
  rpcUrl = "",
  forkBlock = "",
  signal = null,
  onProgress = () => {},
}) {
  onProgress({ stage: "VALIDATING", overall: 15, message: "Validating Solidity source..." });

  let response;
  if (file instanceof File || file instanceof Blob) {
    const formData = new FormData();
    formData.append("file", file, filename || file.name || "contract.sol");
    formData.append("protocol", protocol);
    formData.append("roleMap", JSON.stringify(roleMap));
    formData.append("constructorArgs", constructorArgs);
    formData.append("mode", mode);
    if (rpcUrl) formData.append("rpcUrl", rpcUrl);
    if (forkBlock) formData.append("forkBlock", forkBlock);

    onProgress({ stage: "COMPILING", overall: 35, message: "Compiling contract via forge build..." });
    response = await fetch("/api/scan", {
      method: "POST",
      body: formData,
      signal,
    });
  } else {
    onProgress({ stage: "COMPILING", overall: 35, message: "Compiling contract via forge build..." });
    response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        filename,
        protocol,
        roleMap,
        constructorArgs,
        holds,
        mode,
        rpcUrl,
        forkBlock,
      }),
      signal,
    });
  }

  onProgress({ stage: "SIMULATING", overall: 75, message: "Executing Foundry attack simulation harness..." });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = data.details
      ? `${data.error || "Analysis error"}:\n${data.details}`
      : (data.error || "Analysis execution failed.");
    const err = new Error(errorMsg);
    err.code = data.code || "ANALYSIS_FAILED";
    err.details = data.details || "";
    err.status = response.status;
    throw err;
  }

  onProgress({ stage: "COMPLETE", overall: 100, message: "Analysis complete." });

  const uiReport = adaptScanReport(data);
  realReportsCache.set(uiReport.report_id, uiReport);
  return uiReport;
}

/**
 * Fetches real reports from GET /api/reports and full reports from GET /api/reports/<id>.
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
