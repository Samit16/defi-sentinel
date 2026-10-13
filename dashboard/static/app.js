/**
 * DeFiSentinel Web Dashboard Application
 * Fetches simulation reports, renders KPI metrics, and displays head-to-head security matrix.
 */

document.addEventListener('DOMContentLoaded', () => {
  const reportSelect = document.getElementById('reportSelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const sampleNotice = document.getElementById('sampleNotice');
  const loadStatus = document.getElementById('loadStatus');
  let reportRequestId = 0;

  function setStatus(message) {
    if (loadStatus) loadStatus.textContent = message;
  }

  function formatNumber(value, decimals = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(decimals) : '—';
  }

  function formatMetric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : '—';
  }

  function clearReportView(message) {
    reportIdDisplay.textContent = 'Report: --';
    reportTimeDisplay.textContent = 'Generated: --';
    modeBadge.textContent = 'NO DATA';
    forkBlockBadge.classList.add('hidden');
    sampleNotice.classList.add('hidden');
    kpiTotal.textContent = '—';
    kpiSucceeded.textContent = '—';
    kpiFailed.textContent = '—';
    kpiDuration.textContent = '—';
    matrixTableBody.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'text-center py-4 text-muted';
    cell.textContent = message;
    row.appendChild(cell);
    matrixTableBody.appendChild(row);
  }

  const reportIdDisplay = document.getElementById('reportIdDisplay');
  const reportTimeDisplay = document.getElementById('reportTimeDisplay');
  const modeBadge = document.getElementById('modeBadge');
  const forkBlockBadge = document.getElementById('forkBlockBadge');

  const kpiTotal = document.getElementById('kpiTotal');
  const kpiSucceeded = document.getElementById('kpiSucceeded');
  const kpiFailed = document.getElementById('kpiFailed');
  const kpiDuration = document.getElementById('kpiDuration');

  const matrixTableBody = document.getElementById('matrixTableBody');

  const MODULE_METADATA = {
    reentrancy: {
      name: 'Reentrancy Drain',
      target: 'ETH Vault (deposit/withdraw)',
      cwe: 'CWE-841 / SWC-107',
    },
    oracle: {
      name: 'Oracle Manipulation',
      target: 'Collateralized Lending Pool',
      cwe: 'CWE-829 / Spot Price Distortion',
    },
    flash_loan: {
      name: 'Flash Loan Multi-Step Attack',
      target: 'FlashLender + AMM + Lending',
      cwe: 'CWE-840 / Atomic Arbitrage Pump',
    },
    governance: {
      name: 'Governance Takeover',
      target: 'DAO Treasury & Voting Protocol',
      cwe: 'CWE-284 / Flash-Loaned Votes',
    },
  };

  async function fetchReportsList() {
    const previousSelection = reportSelect.value;
    setStatus('Loading report history…');
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const reports = await res.json();

      reportSelect.innerHTML = '';
      if (!Array.isArray(reports) || reports.length === 0) {
        reportSelect.innerHTML = '<option value="">No reports found</option>';
        clearReportView('No simulation reports are available yet. Run the simulation engine, then refresh.');
        setStatus('No reports available.');
        return;
      }

      reports.forEach((r, idx) => {
        const opt = document.createElement('option');
        opt.value = r.id;
        const tag = r.is_sample ? ' [Sample Data]' : '';
        const timeStr = r.generated_at ? new Date(r.generated_at).toLocaleString() : r.id;
        opt.textContent = `${r.id} (${timeStr})${tag}`;
        if (r.id === previousSelection || (!previousSelection && idx === 0)) opt.selected = true;
        reportSelect.appendChild(opt);
      });

      // Preserve the selected report on refresh when it still exists.
      const selectedReport = reports.find((report) => report.id === reportSelect.value) || reports[0];
      reportSelect.value = selectedReport.id;
      await loadReport(selectedReport.id);
    } catch (err) {
      console.error('Failed fetching reports list:', err);
      setStatus('Could not load report history. Check the connection and retry.');
      if (!reportSelect.options.length) {
        reportSelect.innerHTML = '<option value="">Error loading reports</option>';
      }
    }
  }

  async function loadReport(reportId) {
    const requestId = ++reportRequestId;
    setStatus(`Loading report ${reportId}…`);
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (requestId !== reportRequestId) return;
      renderReport(data);
      setStatus(`Loaded report ${data.report_id || reportId}.`);
    } catch (err) {
      if (requestId !== reportRequestId) return;
      console.error(`Failed loading report ${reportId}:`, err);
      clearReportView(`Could not load report “${reportId}”. Refresh the report list or try another report.`);
      setStatus(`Failed to load report ${reportId}.`);
    }
  }

  function renderReport(data) {
    // Header information
    reportIdDisplay.textContent = `Report: ${data.report_id || 'Unknown'}`;
    const dateFormatted = data.generated_at ? new Date(data.generated_at).toUTCString() : '--';
    reportTimeDisplay.textContent = `Generated: ${dateFormatted}`;

    // Sample notice
    if (data.is_sample) {
      sampleNotice.classList.remove('hidden');
    } else {
      sampleNotice.classList.add('hidden');
    }

    // Mode badges
    const mode = (data.mode || 'local').toUpperCase();
    modeBadge.textContent = mode === 'FORK' ? 'NETWORK FORK' : 'LOCAL EVM';

    if (data.fork_block) {
      forkBlockBadge.textContent = `FORK BLOCK: #${data.fork_block}`;
      forkBlockBadge.classList.remove('hidden');
    } else {
      forkBlockBadge.classList.add('hidden');
    }

    // KPIs
    const summary = data.summary || {};
    kpiTotal.textContent = formatMetric(summary.total !== undefined ? summary.total : (Array.isArray(data.results) ? data.results.length : 0));
    kpiSucceeded.textContent = formatMetric(summary.succeeded !== undefined ? summary.succeeded : 0);
    kpiFailed.textContent = formatMetric(summary.failed !== undefined ? summary.failed : 0);

    let totalDuration = 0;
    if (Array.isArray(data.results)) {
      data.results.forEach((r) => {
        const duration = Number(r.duration_s || 0);
        if (Number.isFinite(duration) && duration >= 0) totalDuration += duration;
      });
    }
    kpiDuration.textContent = `${totalDuration.toFixed(2)}s`;

    // Group results by module
    const grouped = {};
    if (data.results) {
      data.results.forEach(r => {
        const mod = r.module;
        if (!grouped[mod]) {
          grouped[mod] = {};
        }
        grouped[mod][r.variant] = r;
      });
    }

    // Render Matrix Table
    matrixTableBody.innerHTML = '';
    const moduleKeys = Object.keys(MODULE_METADATA);

    moduleKeys.forEach(modKey => {
      const meta = MODULE_METADATA[modKey];
      const vuln = grouped[modKey] ? grouped[modKey]['vulnerable'] : null;
      const prot = grouped[modKey] ? grouped[modKey]['protected'] : null;

      const row = document.createElement('tr');

      // Module Cell
      const modCell = `
        <td>
          <div class="module-cell">
            <span class="module-title">${meta.name}</span>
            <span class="module-tag">${meta.target}</span>
            <span class="module-tag" style="color: var(--accent-indigo);">${meta.cwe}</span>
          </div>
        </td>
      `;

      // Vulnerable Cell
      let vulnCell = '';
      if (vuln) {
        const isSucceeded = vuln.status === 'SUCCEEDED';
        const badgeClass = isSucceeded ? 'status-succeeded' : 'status-failed';
        const badgeLabel = isSucceeded ? '⚠️ VULNERABLE' : '🛡️ BLOCKED';
        const profitClass = Number(vuln.profit_eth) > 0 ? 'profit-loot' : 'profit-zero';

        vulnCell = `
          <td>
            <div class="status-badge ${badgeClass}">${badgeLabel}</div>
            <div class="profit-text ${profitClass}">+${formatNumber(vuln.profit_eth, 4)} ETH profit</div>
            <p class="note-text">${escapeHtml(vuln.note || '')}</p>
          </td>
        `;
      } else {
        vulnCell = `<td class="text-muted">Not evaluated</td>`;
      }

      // Protected Cell
      let protCell = '';
      if (prot) {
        const isBlocked = prot.status === 'FAILED';
        const badgeClass = isBlocked ? 'status-failed' : 'status-succeeded';
        const badgeLabel = isBlocked ? '🛡️ PROTECTED' : '⚠️ BREACHED';
        const profitClass = Number(prot.profit_eth) > 0 ? 'profit-loot' : 'profit-zero';

        protCell = `
          <td>
            <div class="status-badge ${badgeClass}">${badgeLabel}</div>
            <div class="profit-text ${profitClass}">+${formatNumber(prot.profit_eth, 4)} ETH profit</div>
            <p class="note-text">${escapeHtml(prot.note || '')}</p>
          </td>
        `;
      } else {
        protCell = `<td class="text-muted">Not evaluated</td>`;
      }

      // Verdict Cell
      let verdictHtml = '';
      if (vuln && prot) {
        const vulnExploited = vuln.status === 'SUCCEEDED';
        const protHeld = prot.status === 'FAILED';

        if (vulnExploited && protHeld) {
          verdictHtml = `
            <td>
              <div class="verdict-box">
                <span class="verdict-tag verdict-verified">DEFENSE VERIFIED</span>
                <p class="verdict-summary">
                  <strong>VULNERABLE:</strong> attacker gained ${formatNumber(vuln.profit_eth, 2)} ETH<br>
                  <strong>PROTECTED:</strong> attack blocked
                </p>
              </div>
            </td>
          `;
        } else {
          verdictHtml = `
            <td>
              <div class="verdict-box">
                <span class="verdict-tag" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">INCONCLUSIVE</span>
                <p class="verdict-summary">Vuln: ${escapeHtml(String(vuln.status || 'UNKNOWN'))} / Prot: ${escapeHtml(String(prot.status || 'UNKNOWN'))}</p>
              </div>
            </td>
          `;
        }
      } else {
        verdictHtml = `<td><span class="text-muted">Partial Data</span></td>`;
      }

      row.innerHTML = modCell + vulnCell + protCell + verdictHtml;
      matrixTableBody.appendChild(row);
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  reportSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      loadReport(e.target.value);
    }
  });

  refreshBtn.addEventListener('click', () => {
    fetchReportsList();
  });

  // Initial load
  fetchReportsList();
});
