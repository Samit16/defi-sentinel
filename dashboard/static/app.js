/**
 * DeFiSentinel Web Dashboard Application
 * Fetches simulation reports, renders KPI metrics, and displays head-to-head security matrix.
 */

document.addEventListener('DOMContentLoaded', () => {
  const reportSelect = document.getElementById('reportSelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const sampleNotice = document.getElementById('sampleNotice');

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
    try {
      const res = await fetch('/api/reports');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const reports = await res.json();

      reportSelect.innerHTML = '';
      if (!reports || reports.length === 0) {
        reportSelect.innerHTML = '<option value="">No reports found</option>';
        return;
      }

      reports.forEach((r, idx) => {
        const opt = document.createElement('option');
        opt.value = r.id;
        const tag = r.is_sample ? ' [Sample Data]' : '';
        const timeStr = r.generated_at ? new Date(r.generated_at).toLocaleString() : r.id;
        opt.textContent = `${r.id} (${timeStr})${tag}`;
        if (idx === 0) opt.selected = true;
        reportSelect.appendChild(opt);
      });

      // Load first report
      if (reports.length > 0) {
        await loadReport(reports[0].id);
      }
    } catch (err) {
      console.error('Failed fetching reports list:', err);
      reportSelect.innerHTML = '<option value="">Error loading reports</option>';
    }
  }

  async function loadReport(reportId) {
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      renderReport(data);
    } catch (err) {
      console.error(`Failed loading report ${reportId}:`, err);
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
    kpiTotal.textContent = summary.total !== undefined ? summary.total : (data.results ? data.results.length : 0);
    kpiSucceeded.textContent = summary.succeeded !== undefined ? summary.succeeded : 0;
    kpiFailed.textContent = summary.failed !== undefined ? summary.failed : 0;

    let totalDuration = 0;
    if (data.results) {
      data.results.forEach(r => {
        totalDuration += parseFloat(r.duration_s || 0);
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
        const profitClass = vuln.profit_eth > 0 ? 'profit-loot' : 'profit-zero';

        vulnCell = `
          <td>
            <div class="status-badge ${badgeClass}">${badgeLabel}</div>
            <div class="profit-text ${profitClass}">+${vuln.profit_eth.toFixed(4)} ETH profit</div>
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
        const profitClass = prot.profit_eth > 0 ? 'profit-loot' : 'profit-zero';

        protCell = `
          <td>
            <div class="status-badge ${badgeClass}">${badgeLabel}</div>
            <div class="profit-text ${profitClass}">+${prot.profit_eth.toFixed(4)} ETH profit</div>
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
                  <strong>VULNERABLE:</strong> attacker gained ${vuln.profit_eth.toFixed(2)} ETH<br>
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
                <p class="verdict-summary">Vuln: ${vuln.status} / Prot: ${prot.status}</p>
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
