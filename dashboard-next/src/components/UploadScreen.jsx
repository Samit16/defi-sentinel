import { useState } from "react";
import ScreenHeader from "./ScreenHeader";

export function errorsForUpload(name, source) {
  const errors = [];
  const trimmedName = (name || "").trim();
  const trimmedSource = (source || "").trim();

  if (!trimmedName) {
    errors.push("File name is required.");
  } else if (!trimmedName.toLowerCase().endsWith(".sol")) {
    errors.push("File name must end in .sol.");
  }

  if (!trimmedSource) {
    errors.push("Source is empty. Select a file or paste Solidity code.");
  } else {
    const bytes = new TextEncoder().encode(trimmedSource).length;
    if (bytes >= 100 * 1024) {
      errors.push("Source must be smaller than 100 KB.");
    }
    const hasSolidity = /\b(pragma\s+solidity|contract|interface|library)\b/i.test(trimmedSource);
    if (!hasSolidity) {
      errors.push("Source code must contain Solidity declarations (pragma, contract, interface, or library).");
    }
  }
  return errors;
}

export default function UploadScreen({ state, setState, showToast }) {
  const [isDragging, setIsDragging] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(Boolean(state.fileName || state.source));

  const name = state.fileName || "";
  const code = state.source || "";
  const bytes = new TextEncoder().encode(code).length;
  const lines = code
    ? code
        .split("\n")
        .slice(0, 7)
        .map((line, i) => `${String(i + 1).padStart(2, "0")}  ${line}`)
        .join("\n")
    : "";

  const errors = hasInteracted ? errorsForUpload(name, code) : [];

  const handleSourceChange = (newSource, newName) => {
    setHasInteracted(true);
    const updatedName = (newName !== undefined ? newName : (state.fileName || "Contract.sol")).trim();
    const errs = errorsForUpload(updatedName, newSource);
    setState(prev => ({
      ...prev,
      fileName: updatedName,
      source: newSource,
      uploadValid: errs.length === 0,
      report: null, // Clear any stale report on new input
      runRows: null,
      overallProgress: 0,
    }));
  };

  const handleNameChange = (newName) => {
    setHasInteracted(true);
    const updatedName = newName.trim();
    const errs = errorsForUpload(updatedName, state.source || "");
    setState(prev => ({
      ...prev,
      fileName: updatedName,
      uploadValid: errs.length === 0,
    }));
  };

  const loadFile = async (file) => {
    if (!file) return;
    setHasInteracted(true);
    const fileName = file.name;
    if (file.size > 100 * 1024) {
      setState(prev => ({
        ...prev,
        fileName,
        source: "",
        uploadValid: false,
        report: null,
      }));
      showToast("Source must be smaller than 100 KB.");
      return;
    }
    try {
      const text = await file.text();
      const errs = errorsForUpload(fileName, text);
      setState(prev => ({
        ...prev,
        fileName,
        source: text,
        uploadValid: errs.length === 0,
        report: null,
        runRows: null,
        overallProgress: 0,
      }));
      if (errs.length > 0) {
        showToast(errs[0]);
      } else {
        showToast(`Loaded ${fileName}`);
      }
    } catch {
      setState(prev => ({ ...prev, fileName, source: "", uploadValid: false, report: null }));
      showToast("The selected file could not be read.");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length !== 1) {
      showToast("Choose one .sol file at a time.");
      return;
    }
    loadFile(files[0]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setHasInteracted(true);
    const effectiveName = (state.fileName || "").trim();
    const effectiveSource = (state.source || "").trim();
    const errs = errorsForUpload(effectiveName, effectiveSource);
    if (errs.length > 0 || !effectiveSource) {
      setState(prev => ({ ...prev, uploadValid: false }));
      showToast(errs[0] || "Please select or paste valid Solidity source before proceeding.");
      return;
    }
    setState(prev => ({
      ...prev,
      fileName: effectiveName,
      source: effectiveSource,
      uploadValid: true,
      protocol: "",
      roleMap: {},
      report: null, // Clear previous report so new scan cannot display old report
      runRows: null,
      overallProgress: 0,
    }));
    window.location.hash = "/configure";
  };

  return (
    <section className="screen" aria-labelledby="screen-title">
      <ScreenHeader num="01" label="UPLOAD SOURCE" right="SOLIDITY FILE / MAX 100 KB" />
      <div className="upload-layout">
        <div className="upload-copy">
          <div className="eyebrow">PRE-LAUNCH SECURITY SIMULATION</div>
          <h1 id="screen-title" className="display display-xl">
            <span className="line">Verify before</span>
            <span className="line">mainnet.</span>
          </h1>
          <p className="lede">
            A local, pre-launch check for DeFi developers. Map the contract&apos;s roles, then execute simulated attack paths against the actual uploaded Solidity source code on an isolated EVM.
          </p>
          <p className="micro tracked" style={{ marginTop: 24 }}>
            REAL SUBPROCESS EXECUTION <span aria-hidden="true">/</span> FOUNDRY EVM <span aria-hidden="true">/</span> ZERO MOCKED RESULTS
          </p>
        </div>
        <form className="upload-card bracket-panel" id="uploadForm" noValidate onSubmit={handleSubmit}>
          <div className="section-rule">SOURCE CONTRACT <span className="muted">.SOL ONLY</span></div>
          <label
            className={`dropzone ${isDragging ? "is-dragging" : ""}`}
            id="dropzone"
            htmlFor="fileInput"
            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
          >
            <svg className="upload-symbol" viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <path d="M18 25V8m0 0-6 6m6-6 6 6M7 23v7h22v-7" stroke="currentColor" strokeWidth="1.2" />
              <path d="M3.5 3.5h7m-7 0v7m29-7h-7m7 0v7M3.5 32.5h7m-7 0v-7m29 7h-7m7 0v-7" stroke="currentColor" strokeOpacity=".35" />
            </svg>
            <strong>Drop one Solidity file here</strong>
            <small>or choose a file · max 100 KB</small>
            <input
              className="visually-hidden"
              type="file"
              id="fileInput"
              accept=".sol,text/plain"
              aria-label="Choose one Solidity file"
              onChange={(e) => loadFile(e.target.files?.[0])}
            />
          </label>
          <div className="upload-divider">OR PASTE SOLIDITY SOURCE CODE</div>
          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <label className="field-label" htmlFor="sourceName">
                CONTRACT FILE NAME <span style={{ color: "var(--mint)" }}>*</span>
              </label>
              <button
                type="button"
                className="sample-load-btn"
                onClick={() => {
                  const sampleName = "VaultVulnerable.sol";
                  const sampleCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VaultVulnerable {
    mapping(address => uint256) public balances;
    bool private locked;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 bal = balances[msg.sender];
        require(bal > 0, "No balance");
        // State updated AFTER external call (Reentrancy vector)
        (bool ok, ) = msg.sender.call{value: bal}("");
        require(ok, "Transfer failed");
        balances[msg.sender] = 0;
    }

    function balanceOf(address user) external view returns (uint256) {
        return balances[user];
    }
}`;
                  handleSourceChange(sampleCode, sampleName);
                  showToast("Loaded sample VaultVulnerable.sol");
                }}
              >
                + Load Sample Vault (.sol)
              </button>
            </div>
            <input
              className="text-input"
              id="sourceName"
              name="sourceName"
              placeholder="e.g. MyContract.sol (must end in .sol)"
              value={state.fileName || ""}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={120}
              spellCheck={false}
              aria-describedby="uploadErrors"
              aria-required="true"
            />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label" htmlFor="sourceCode">
              SOLIDITY SOURCE CODE <span style={{ color: "var(--mint)" }}>*</span>
            </label>
            <textarea
              className="text-area paste-code"
              id="sourceCode"
              name="sourceCode"
              placeholder="// Paste Solidity source here (must contain 'pragma solidity', 'contract', etc.)"
              spellCheck={false}
              aria-describedby="uploadErrors"
              aria-required="true"
              value={code}
              onChange={(e) => handleSourceChange(e.target.value)}
            />
          </div>
          <div className="file-meta">
            <span id="fileMetaName">
              <strong>{state.fileName || "No contract loaded"}</strong>
            </span>
            <span id="fileMetaSize">{bytes ? `${bytes.toLocaleString()} B` : "0 B"}</span>
          </div>
          <pre
            id="codePreview"
            className={`code-preview${code ? " is-visible" : ""}`}
            aria-label="Monospace Solidity preview"
          >
            {lines || "Source preview will appear here."}
          </pre>
          <ul
            id="uploadErrors"
            className={`error-list${errors.length > 0 ? " is-visible" : ""}`}
            role="alert"
            aria-live="assertive"
          >
            {errors.map((e, idx) => (
              <li key={idx}>{e}</li>
            ))}
          </ul>
          <div className="upload-actions">
            <span className="hint">
              {!state.uploadValid || !code.trim() || !(state.fileName || "").trim() ? (
                <span className="disabled-reason">
                  ⚠ Add a valid .sol file and non-empty contract source to proceed.
                </span>
              ) : (
                <span className="ready-indicator" style={{ color: "var(--mint)" }}>
                  ✓ Source valid. Ready to configure roles.
                </span>
              )}
            </span>
            <button
              className="button"
              id="continueUpload"
              type="submit"
              disabled={!state.uploadValid || !code.trim() || !(state.fileName || "").trim()}
              title={
                !state.uploadValid || !code.trim() || !(state.fileName || "").trim()
                  ? "Upload or paste valid Solidity code ending in .sol to enable"
                  : "Proceed to Stage 02: Configure Roles"
              }
            >
              CONTINUE TO CONFIGURE <span className="button-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
