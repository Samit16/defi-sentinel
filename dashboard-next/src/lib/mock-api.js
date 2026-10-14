/*
 * Local demo adapter. These mock functions will later be replaced by:
 * POST /api/targets
 * POST /api/scans
 * GET /api/scans/<id>
 * GET /api/reports
 * GET /api/reports/<id>
 *
 * No Solidity is compiled and no network or chain is contacted here.
 */
const ATTACKS = ["Reentrancy", "Oracle Manipulation", "Flash Loan", "Governance Takeover"];

import { fetchRealEngineReports, realReportsCache, getApiStatus } from "./real-api.js";

export const FINDINGS = {
  "Reentrancy": {
    lacking: "the contract makes an external call before it updates its own balances.",
    fix: "update state first (checks-effects-interactions) or add a reentrancy guard."
  },
  "Oracle Manipulation": {
    lacking: "collateral is priced from a single pool's spot price that one big swap can distort.",
    fix: "use a time-weighted average price (TWAP) or reject large price deviations."
  },
  "Flash Loan": {
    lacking: "the same price weakness can be exploited with borrowed capital that costs almost nothing.",
    fix: "use the same price protections and limit what can be done within one transaction."
  },
  "Governance Takeover": {
    lacking: "voting power is read from the live token balance, so borrowed tokens count as votes.",
    fix: "use snapshot voting power from a previous block."
  }
};


const report = (report_id, generated_at, target, results) => ({
  report_id,
  generated_at,
  mode: "local",
  target,
  is_real: false,
  simulation_type: "demo",
  summary: {
    total: results.length,
    succeeded: results.filter(
      (x) => x.status === "SUCCEEDED"
    ).length,
    failed: results.filter(
      (x) => x.status === "FAILED"
    ).length,
    not_applicable: results.filter(
      (x) => x.status === "NOT APPLICABLE"
    ).length,
  },
  results,
});


export const SAMPLE_REPORTS = [
  report("DS-7A31", "2026-10-12T16:44:00.000Z", "YieldVault.sol", [
    {module:"Reentrancy",status:"SUCCEEDED",profit_eth:10.0,note:"An external call can occur before the vault balance is reduced.",duration_s:8.4},
    {module:"Oracle Manipulation",status:"NOT APPLICABLE",profit_eth:0,note:"No configured price-reading function for this vault sample.",duration_s:2.1},
    {module:"Flash Loan",status:"NOT APPLICABLE",profit_eth:0,note:"No configured lending or price-sensitive path for this vault sample.",duration_s:2.3},
    {module:"Governance Takeover",status:"NOT APPLICABLE",profit_eth:0,note:"No governance role was configured for this vault sample.",duration_s:1.8}
  ]),
  report("DS-51C8", "2026-10-11T09:18:00.000Z", "ReserveVault.sol", [
    {module:"Reentrancy",status:"FAILED",profit_eth:0,note:"The sample guard blocks a repeated withdrawal during callback.",duration_s:8.1},
    {module:"Oracle Manipulation",status:"FAILED",profit_eth:0,note:"The sample price check rejects a manipulated spot quote.",duration_s:7.8},
    {module:"Flash Loan",status:"FAILED",profit_eth:0,note:"The sample transaction-boundary checks prevent this path.",duration_s:8.8},
    {module:"Governance Takeover",status:"NOT APPLICABLE",profit_eth:0,note:"No governance role was configured for this vault sample.",duration_s:1.6}
  ]),
  report("DS-2E90", "2026-10-10T13:02:00.000Z", "CreditMarket.sol", [
    {module:"Reentrancy",status:"FAILED",profit_eth:0,note:"The sample balance update occurs before the external call.",duration_s:8.2},
    {module:"Oracle Manipulation",status:"SUCCEEDED",profit_eth:61.9,note:"A distorted spot quote increases the sample collateral value.",duration_s:9.1},
    {module:"Flash Loan",status:"SUCCEEDED",profit_eth:154.0,note:"Borrowed capital amplifies the sample price-manipulation path.",duration_s:10.3},
    {module:"Governance Takeover",status:"NOT APPLICABLE",profit_eth:0,note:"No governance role was configured for this lending sample.",duration_s:1.7}
  ])
];

const clone = value => JSON.parse(JSON.stringify(value));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function outcomesFor(protocol) {
  if (protocol === "VAULT") return [
    ["SUCCEEDED", 10.0, "An external call can occur before the vault balance is reduced."],
    ["NOT APPLICABLE", 0, "No configured price-reading function for this vault sample."],
    ["NOT APPLICABLE", 0, "No configured lending or price-sensitive path for this vault sample."],
    ["NOT APPLICABLE", 0, "No governance role was configured for this vault sample."]
  ];
  if (protocol === "LENDING") return [
    ["FAILED", 0, "The sample balance update occurs before the external call."],
    ["SUCCEEDED", 61.9, "A distorted spot quote increases the sample collateral value."],
    ["SUCCEEDED", 154.0, "Borrowed capital amplifies the sample price-manipulation path."],
    ["NOT APPLICABLE", 0, "No governance role was configured for this lending sample."]
  ];
  return [
    ["FAILED", 0, "The sample balance update occurs before the external call."],
    ["NOT APPLICABLE", 0, "No configured price-reading function for this governance sample."],
    ["NOT APPLICABLE", 0, "No configured lending or price-sensitive path for this governance sample."],
    ["SUCCEEDED", 4.2, "Live balance voting lets borrowed tokens influence the sample vote."]
  ];
}

/** Sequentially advances four fake attack modules. `scale` is injectable for fast test runs. */
export async function runFakeScan({ target, protocol, onUpdate = () => {}, scale = 1, signal } = {}) {
  const started = performance.now();
  const rows = ATTACKS.map((module, index) => ({
    module, state: "QUEUED", progress: 0, elapsed_s: 0, duration_s: [2.8, 3.2, 3.6, 3.0][index]
  }));
  const outcomes = outcomesFor(protocol);
  onUpdate({ rows: clone(rows), overall: 0, elapsed_s: 0 });
  for (let i = 0; i < rows.length; i += 1) {
    if (signal?.aborted) throw new DOMException("Simulation cancelled", "AbortError");
    rows[i].state = "RUNNING";
    const moduleStarted = performance.now();
    const durationMs = Math.max(180, rows[i].duration_s * 1000 * scale);
    while (performance.now() - moduleStarted < durationMs) {
      if (signal?.aborted) throw new DOMException("Simulation cancelled", "AbortError");
      rows[i].progress = Math.min(98, Math.round(((performance.now() - moduleStarted) / durationMs) * 100));
      rows[i].elapsed_s = (performance.now() - moduleStarted) / 1000;
      onUpdate({ rows: clone(rows), overall: Math.round(((i + rows[i].progress / 100) / rows.length) * 100), elapsed_s: (performance.now() - started) / 1000 });
      await sleep(Math.min(100, durationMs / 12));
    }
    rows[i].state = "DONE";
    rows[i].progress = 100;
    rows[i].elapsed_s = durationMs / 1000;
    onUpdate({ rows: clone(rows), overall: Math.round(((i + 1) / rows.length) * 100), elapsed_s: (performance.now() - started) / 1000 });
  }
  const results = ATTACKS.map((module, index) => ({
    module,
    status: outcomes[index][0],
    profit_eth: outcomes[index][1],
    note: outcomes[index][2],
    duration_s: Number(rows[index].elapsed_s.toFixed(1))
  }));
  const stamp = new Date().toISOString();
  const id = `DS-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
  return report(id, stamp, target || "UploadedContract.sol", results);
}

export function getLocalHistory() {
  if (typeof window === "undefined") return clone(SAMPLE_REPORTS);
  try {
    const raw = localStorage.getItem("defisentinel:history");
    if (raw === null) return clone(SAMPLE_REPORTS);
    const stored = JSON.parse(raw);
    return Array.isArray(stored) ? stored : clone(SAMPLE_REPORTS);
  } catch {
    return clone(SAMPLE_REPORTS);
  }
}

export async function getHistoryData() {
  const realReports = await fetchRealEngineReports();
  const apiStatus = getApiStatus();
  const localList = getLocalHistory().map(r => ({ ...r, is_real: false }));

  if (apiStatus.failed || apiStatus.empty || realReports.length === 0) {
    return {
      reports: localList,
      isFallback: true,
      fallbackReason: apiStatus.failed
        ? "REAL ENGINE DATA UNAVAILABLE (/api/reports request failed). SHOWING DEMO DATA."
        : "NO REAL ENGINE REPORTS FOUND (/api/reports returned empty). SHOWING DEMO DATA.",
    };
  }

  return {
    reports: [...realReports, ...localList],
    isFallback: false,
    fallbackReason: null,
  };
}

export function getHistory() {
  const realList = Array.from(realReportsCache.values());
  const localList = getLocalHistory().map(r => ({ ...r, is_real: false }));
  return [...realList, ...localList];
}

export function saveReport(newReport) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("defisentinel:history");
    const stored = raw === null ? clone(SAMPLE_REPORTS) : JSON.parse(raw);
    newReport.is_real = false;
    localStorage.setItem("defisentinel:history", JSON.stringify([newReport, ...stored].slice(0, 12)));
  } catch (error) {
    console.warn("Unable to save demo report to local storage.", error);
  }
}

export function getReportById(id) {
  if (realReportsCache.has(id)) {
    return realReportsCache.get(id);
  }
  const localList = getLocalHistory();
  return localList.find(item => item.report_id === id) || null;
}
