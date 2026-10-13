import { FINDINGS, getHistory, getHistoryData } from "./mock-api.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate = value => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
};
const glyph = `<svg class="glyph-divider" viewBox="0 0 84 12" fill="none" aria-hidden="true"><path d="M.5 1.5h83v9h-68l-5-4-5 4H.5z" stroke="currentColor" stroke-opacity=".55"/><path d="M17 2v8M24 3l5 6M32 3l5 6M42 3h8M55 3h4M63 3h10" stroke="currentColor" stroke-opacity=".45"/><path d="m25 2 5 8m5-8 5 8" stroke="currentColor" stroke-opacity=".75" stroke-width="2"/></svg>`;
const header = (num, label, right = "LOCAL SIMULATION") => `<div class="screen-header"><div class="screen-label"><span class="num">${num}</span><span>/</span><span>${label}</span></div>${glyph}<span class="screen-index">${right}</span></div>`;
const iconUpload = `<svg class="upload-symbol" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M18 25V8m0 0-6 6m6-6 6 6M7 23v7h22v-7" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 3.5h7m-7 0v7m29-7h-7m7 0v7M3.5 32.5h7m-7 0v-7m29 7h-7m7 0v-7" stroke="currentColor" stroke-opacity=".35"/></svg>`;

export function uploadView(state) {
  const name = state.fileName || "";
  const code = state.source || "";
  const bytes = new TextEncoder().encode(code).length;
  const lines = code ? code.split("\n").slice(0, 7).map((line, i) => `${String(i+1).padStart(2,"0")}  ${line}`).join("\n") : "";
  return `<section class="screen" aria-labelledby="screen-title">
    ${header("01","UPLOAD SOURCE","SOLIDITY FILE / MAX 100 KB")}
    <div class="upload-layout">
      <div class="upload-copy">
        <div class="eyebrow">PRE-LAUNCH SECURITY SIMULATION</div>
        <h1 id="screen-title" class="display display-xl"><span class="line">Verify before</span><span class="line">mainnet.</span></h1>
        <p class="lede">A local, pre-launch check for DeFi developers. Map the contract's roles, then review four simulated attack paths against a safe sample scenario.</p>
        <p class="micro tracked" style="margin-top:24px">NO DEPLOYMENT <span aria-hidden="true">/</span> NO RPC <span aria-hidden="true">/</span> NO AUDIT CLAIM</p>
      </div>
      <form class="upload-card bracket-panel" id="uploadForm" novalidate>
        <div class="section-rule">SOURCE CONTRACT <span class="muted">.SOL ONLY</span></div>
        <label class="dropzone" id="dropzone" for="fileInput">
          ${iconUpload}
          <strong>Drop one Solidity file here</strong>
          <small>or choose a file · max 100 KB</small>
          <input class="visually-hidden" type="file" id="fileInput" accept=".sol,text/plain" aria-label="Choose one Solidity file">
        </label>
        <div class="upload-divider">OR PASTE SOURCE</div>
        <div class="field">
          <label class="field-label" for="sourceName">FILE NAME</label>
          <input class="text-input" id="sourceName" name="sourceName" value="${esc(name || "PastedContract.sol")}" maxlength="120" spellcheck="false" aria-describedby="uploadErrors">
        </div>
        <div class="field" style="margin-top:11px">
          <label class="field-label" for="sourceCode">SOLIDITY SOURCE</label>
          <textarea class="text-area paste-code" id="sourceCode" name="sourceCode" placeholder="// Paste contract source here" spellcheck="false" aria-describedby="uploadErrors">${esc(code)}</textarea>
        </div>
        <div class="file-meta"><span id="fileMetaName"><strong>${esc(name || "No source selected")}</strong></span><span id="fileMetaSize">${bytes ? `${bytes.toLocaleString()} B` : "0 B"}</span></div>
        <pre id="codePreview" class="code-preview${code ? " is-visible" : ""}" aria-label="Monospace Solidity preview">${esc(lines || "Preview appears when source is entered.")}</pre>
        <ul id="uploadErrors" class="error-list" role="alert" aria-live="assertive"></ul>
        <div class="upload-actions"><span class="hint">.SOL <span aria-hidden="true">/</span> NON-EMPTY <span aria-hidden="true">/</span> &lt;100 KB</span><button class="button" id="continueUpload" type="submit" ${state.uploadValid ? "" : "disabled"}>CONTINUE <span class="button-arrow" aria-hidden="true">→</span></button></div>
      </form>
    </div>
  </section>`;
}

const PROTOCOLS = [
  ["VAULT","Deposits, withdrawals, and shares"],
  ["LENDING","Collateral, borrowing, and pricing"],
  ["GOVERNANCE","Proposals, voting, and execution"]
];
const ROLE_MAP = {VAULT:["deposit","withdraw","balanceOf"],LENDING:["depositCollateral","borrow","getPrice"],GOVERNANCE:["propose","vote","execute"]};
export const rolesForProtocol = protocol => ROLE_MAP[protocol] || [];

export function configureView(state) {
  const funcs = [...new Set((state.source?.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g) || []).map(x => x.match(/\bfunction\s+([A-Za-z_$][\w$]*)/)[1]))];
  const protocol = state.protocol;
  const roles = rolesForProtocol(protocol);
  const mappings = roles.map(role => `<label class="mapping-row"><span class="mapping-label">${esc(role)}</span><select class="select-input role-select" data-role="${esc(role)}" aria-label="Map function for ${esc(role)}" ${!protocol || !funcs.length ? "disabled" : ""}><option value="">${funcs.length ? "Select function" : "No functions detected"}</option>${funcs.map(fn=>`<option value="${esc(fn)}" ${state.roleMap?.[role]===fn?"selected":""}>${esc(fn)}()</option>`).join("")}</select></label>`).join("");
  const missing = !protocol ? ["protocol type"] : roles.filter(role => !state.roleMap?.[role]).map(role => `${role} function`);
  return `<section class="screen" aria-labelledby="screen-title">
    ${header("02","CONFIGURE ROLES","FUNCTIONS PARSED LOCALLY")}
    <div class="configure-layout">
      <div>
        <h1 id="screen-title" class="display display-small" style="margin-bottom:24px">Map contract roles.</h1>
        <div class="section-rule">01 <span>PROTOCOL TYPE</span></div>
        <div class="protocol-grid" role="group" aria-label="Choose protocol type">${PROTOCOLS.map(([id,desc])=>`<button class="protocol-option" type="button" data-protocol="${id}" aria-pressed="${protocol===id}"><span class="protocol-name">${id}</span><span class="protocol-description">${desc}</span></button>`).join("")}</div>
        <div class="section-rule">02 <span>FUNCTION ROLE MAPPING</span></div>
        <p class="micro" style="margin:8px 0 0">SELECT THE FUNCTION THAT PLAYS EACH STANDARD ROLE.</p>
        <div class="mapping-list">${roles.length ? mappings : `<p class="micro">Choose a protocol type to load its expected roles.</p>`}</div>
        ${protocol && !funcs.length ? `<div class="notice" role="status"><span class="notice-mark">!</span><span>No function declarations were found. Add Solidity source with <code>function name(...)</code> declarations, then return to this step.</span></div>` : ""}
      </div>
      <aside class="configure-side bracket-panel">
        <div class="section-rule">03 <span>DEPLOYMENT CONTEXT</span></div>
        <div class="field"><label class="field-label" for="constructorArgs">CONSTRUCTOR ARGUMENTS <span class="muted">/ OPTIONAL</span></label><textarea class="text-area" id="constructorArgs" placeholder="e.g. _asset = 0x…" spellcheck="false">${esc(state.constructorArgs || "")}</textarea></div>
        <div class="toggle-row"><span class="field-label">CONTRACT HOLDS</span><div class="toggle-control"><button type="button" class="toggle-button" data-holds="ETH" aria-pressed="${state.holds?.ETH !== false}">ETH</button><button type="button" class="toggle-button" data-holds="TOKEN" aria-pressed="${state.holds?.TOKEN === true}">TOKEN</button></div></div>
        <div class="notice"><span class="notice-mark">i</span><span>Role names are selected by you. The parser only reads function names; it does not verify behavior.</span></div>
        <div class="validation-message" id="configureMessage" role="status">${missing.length ? `<span class="missing">RUN DISABLED</span> <span aria-hidden="true">/</span> MAP ${missing.map(esc).join(", ")}.` : "ALL REQUIRED ROLES MAPPED. READY FOR SAMPLE RUN."}</div>
        <button class="button" id="runSimulation" type="button" ${missing.length ? "disabled" : ""}>RUN SIMULATION <span class="button-arrow" aria-hidden="true">→</span></button>
      </aside>
    </div>
  </section>`;
}

export function runningView(state) {
  const rows = state.runRows || ["Reentrancy","Oracle Manipulation","Flash Loan","Governance Takeover"].map(module=>({module,state:"QUEUED",progress:0,elapsed_s:0}));
  const list = rows.map((row,i)=>`<div class="attack-row" data-attack="${i}" data-state="${row.state.toLowerCase()}"><div><span class="attack-index">MODULE / 0${i+1}</span><div class="attack-name">${esc(row.module)}</div></div><div class="attack-status"><span class="status-dot" aria-hidden="true"></span><span class="state-label">${esc(row.state)}</span></div><div class="progress-track" role="progressbar" aria-label="${esc(row.module)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(row.progress)}"><div class="progress-bar" style="width:${Math.round(row.progress)}%"></div></div><div class="elapsed">${Number(row.elapsed_s||0).toFixed(1)} S</div></div>`).join("");
  const pct = Math.round(state.overallProgress || 0);
  return `<section class="screen" aria-labelledby="screen-title">
    ${header("03","SIMULATION RUN","LOCAL MOCK ENGINE")}
    <div class="running-head"><div><div class="eyebrow micro tracked">SAFE COPY <span aria-hidden="true">/</span> NO CHAIN CONNECTION</div><h1 id="screen-title" class="display display-small">Four attack paths.</h1></div><div class="run-summary"><span id="overallProgress">${pct}</span>% COMPLETE<br><span id="overallElapsed">0.0</span> S ELAPSED</div></div>
    <div class="attack-list" id="attackList">${list}</div>
    <div class="run-footer"><span class="run-footnote">DEMO DATA <span aria-hidden="true">/</span> THIS TIMELINE IS SIMULATED. NO CONTRACT BYTECODE IS RUN.</span><button class="button button-danger" id="cancelRun" type="button">CANCEL <span aria-hidden="true">×</span></button></div>
  </section>`;
}

const statusClass = status => status === "SUCCEEDED" ? "is-succeeded" : status === "FAILED" ? "is-failed" : "is-na";
const profit = value => `${Number(value || 0).toFixed(1)} ETH`;
function chartSvg(summary) {
  const data = [["SUCCEEDED",summary.succeeded,"coral"],["BLOCKED",summary.failed,"mint"],["NOT APPLICABLE",summary.not_applicable,"na"]];
  return `<svg class="result-chart" viewBox="0 0 470 156" role="img" aria-labelledby="chartTitle chartDesc"><title id="chartTitle">Attack result summary</title><desc id="chartDesc">${data.map(([label,n])=>`${n} ${label.toLowerCase()}`).join(", ")} out of ${summary.total} modules.</desc>${data.map(([label,n,color],i)=>{const y=22+i*45;return `<text x="0" y="${y+10}" fill="#A8A8B0" font-family="IBMPlexMono,monospace" font-size="9">${label}</text><line x1="148" y1="${y+6}" x2="448" y2="${y+6}" stroke="rgba(255,255,255,.11)" stroke-width="1"/><rect x="148" y="${y}" width="${Math.max(2,300*n/Math.max(summary.total,1))}" height="12" fill="var(--${color})"/><text x="458" y="${y+10}" text-anchor="end" fill="#ECECEE" font-family="IBMPlexMono,monospace" font-size="9">${n}</text>`}).join("")}</svg>`;
}

export function reportView(report) {
  if (!report) return `<section class="screen">${header("04","REPORT","NO REPORT SELECTED")}<div class="empty-state"><strong>NO REPORT SELECTED</strong>Run a local simulation or open a history row.</div><a class="button" href="#/upload">START A CHECK →</a></section>`;
  const summary = report.summary;
  const vulnerable = summary.succeeded > 0;
  const isReal = Boolean(report.is_real);
  const title = isReal
    ? (vulnerable ? `${summary.succeeded} OF ${summary.total} ATTACKS SUCCEEDED. CONTRACT IS VULNERABLE.` : `0 OF ${summary.total} ATTACKS SUCCEEDED. ALL ATTACKS BLOCKED.`)
    : (vulnerable ? `${summary.succeeded} OF ${summary.total} ATTACKS SUCCEEDED. CONTRACT IS VULNERABLE.` : `0 OF ${summary.total} ATTACKS SUCCEEDED. NO DEMO EXPLOIT WAS OBSERVED.`);
  const tagHtml = isReal
    ? `<span class="demo-tag demo-tag--real">REAL ENGINE DATA <span aria-hidden="true">/</span> REAL SIMULATION</span>`
    : `<span class="demo-tag">DEMO DATA <span aria-hidden="true">/</span> NOT A REAL SCAN</span>`;
  const verdictNote = isReal
    ? `Real simulation results executed by DeFiSentinel attack modules on local execution fork.`
    : `Local sample outcomes illustrate possible report states only. They are not evidence about this uploaded contract and are not a professional audit.`;
  const resultCards = report.results.map((result,i)=>{
    const finding = FINDINGS[result.module];
    const findings = result.status === "SUCCEEDED" && finding ? `<div class="finding-grid"><section class="finding-panel"><h4>WHAT WAS LACKING</h4><p>${esc(finding.lacking)}</p></section><section class="finding-panel"><h4>SUGGESTED FIX</h4><p>${esc(finding.fix)}</p></section></div>` : "";
    return `<article class="result-card"><div class="result-card-head"><div><span class="attack-index">ATTACK / 0${i+1}</span><div class="result-name">${esc(result.module)}</div><div class="result-note">${esc(result.note)}</div></div><span class="result-status ${statusClass(result.status)}">${esc(result.status)}</span></div><div class="profit-line">ESTIMATED PROFIT <strong>${profit(result.profit_eth)}</strong><span class="muted"> <span aria-hidden="true">/</span> ${Number(result.duration_s||0).toFixed(1)} S</span></div>${findings}</article>`;
  }).join("");
  return `<section class="screen" aria-labelledby="screen-title">
    ${header("04","SIMULATION REPORT",`${esc(report.report_id)} / ${fmtDate(report.generated_at)}`)}
    <div class="report-top"><div class="report-title">${tagHtml}<h1 id="screen-title" class="display display-small">${esc(title)}</h1></div><aside class="verdict-note">${verdictNote}</aside></div>
    <div class="summary-grid" aria-label="Summary figures"><div class="summary-cell"><div class="summary-label">TOTAL MODULES</div><div class="summary-value">${summary.total}</div></div><div class="summary-cell"><div class="summary-label">SUCCEEDED</div><div class="summary-value is-coral">${summary.succeeded}</div></div><div class="summary-cell"><div class="summary-label">BLOCKED</div><div class="summary-value is-mint">${summary.failed}</div></div><div class="summary-cell"><div class="summary-label">NOT APPLICABLE</div><div class="summary-value is-na">${summary.not_applicable}</div></div></div>
    <div class="report-grid"><div><div class="section-rule" style="margin-bottom:14px">ATTACK RESULTS</div><div class="result-list">${resultCards}</div></div><aside><div class="chart-panel"><h3>RESULT DISTRIBUTION</h3><p class="chart-caption">Four modules <span aria-hidden="true">/</span> ${isReal ? "real engine" : "sample-data"} status count</p>${chartSvg(summary)}<div class="chart-key"><span><i class="key-swatch coral"></i>SUCCEEDED</span><span><i class="key-swatch mint"></i>BLOCKED</span><span><i class="key-swatch na"></i>NOT APPLICABLE</span></div></div><div class="report-actions"><button class="button" id="runAgain" type="button">RUN AGAIN <span aria-hidden="true">↻</span></button><button class="button button-secondary" id="copyReport" type="button">COPY REPORT AS JSON</button></div><p class="report-footnote">${isReal ? "REAL ENGINE RUN <span aria-hidden='true'>/</span> LOCAL FORK TEST." : "PRE-LAUNCH CHECK <span aria-hidden='true'>/</span> NOT A REPLACEMENT FOR A PROFESSIONAL AUDIT."}</p></aside></div>
  </section>`;
}

export async function historyView() {
  const { reports, isFallback, fallbackReason } = await getHistoryData();
  reports.sort((a,b)=>new Date(b.generated_at)-new Date(a.generated_at));
  const rows = reports.map(item=>`<tr data-report-id="${esc(item.report_id)}" tabindex="0" aria-label="Open ${item.is_real ? 'real' : 'demo'} report ${esc(item.report_id)} for ${esc(item.target)}"><td class="report-id">${esc(item.report_id)}</td><td>${fmtDate(item.generated_at)}</td><td class="target-cell">${esc(item.target)}</td><td>${esc(item.mode.toUpperCase())}<span class="${item.is_real ? 'table-real' : 'table-demo'}">/ ${item.is_real ? 'REAL ENGINE DATA' : 'DEMO DATA'}</span></td><td class="count-succeeded">${item.summary.succeeded} <span class="muted">/ ${item.summary.total}</span></td><td aria-hidden="true">→</td></tr>`).join("");
  const fallbackNotice = isFallback && fallbackReason ? `<div class="notice" role="status" style="margin-top:16px"><span class="notice-mark">!</span><span>${esc(fallbackReason)}</span></div>` : "";
  return `<section class="screen" aria-labelledby="screen-title">${header("—","HISTORY",isFallback ? "DEMO DATA FALLBACK" : "LOCAL / ENGINE REPORTS")}<div class="history-head"><div><div class="eyebrow micro tracked">REPORT INDEX</div><h1 id="screen-title" class="display display-small">Previous checks.</h1></div><span class="micro">${reports.length} REPORTS <span aria-hidden="true">/</span> CLICK A ROW TO OPEN</span></div>${fallbackNotice}${reports.length ? `<div class="table-wrap" role="region" aria-label="Previous reports" tabindex="0"><table class="history-table"><thead><tr><th scope="col">REPORT ID</th><th scope="col">DATE</th><th scope="col">TARGET</th><th scope="col">MODE</th><th scope="col">SUCCEEDED</th><th scope="col">OPEN</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty-state"><strong>NO REPORTS YET</strong>Run a local simulation to create the first report.</div>`}<p class="micro" style="margin-top:15px">REAL ENGINE REPORTS ARE FETCHED FROM LOCAL ENGINE (/api/reports). DEMO SAMPLE REPORTS ARE STORED LOCALLY.</p></section>`;
}
