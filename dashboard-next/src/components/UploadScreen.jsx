import { useState, useId } from "react";
import ScreenHeader from "./ScreenHeader";

export function errorsForUpload(name, source) {
  const errors = [];
  if (!name.toLowerCase().endsWith(".sol")) errors.push("File name must end in .sol.");
  if (!source.trim()) errors.push("Source is empty. Select a file or paste Solidity code.");
  if (new TextEncoder().encode(source).length >= 100 * 1024) errors.push("Source must be smaller than 100 KB.");
  return errors;
}

export default function UploadScreen({ state, setState, showToast }) {
  const [isDragging, setIsDragging] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const name = state.fileName || (hasInteracted ? "" : "PastedContract.sol");
  const code = state.source || "";
  const bytes = new TextEncoder().encode(code).length;
  const lines = code
    ? code
        .split("\n")
        .slice(0, 7)
        .map((line, i) => `${String(i + 1).padStart(2, "0")}  ${line}`)
        .join("\n")
    : "";

  const errors = hasInteracted ? errorsForUpload(state.fileName || name, code) : [];

  const handleSourceChange = (newSource, newName) => {
    setHasInteracted(true);
    const updatedName = (newName !== undefined ? newName : (state.fileName || "PastedContract.sol")).trim();
    const errs = errorsForUpload(updatedName, newSource);
    setState(prev => ({
      ...prev,
      fileName: updatedName,
      source: newSource,
      uploadValid: errs.length === 0,
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
      setState(prev => ({ ...prev, fileName, source: "", uploadValid: false }));
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
      }));
    } catch {
      setState(prev => ({ ...prev, fileName, source: "", uploadValid: false }));
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
    const effectiveName = (state.fileName || "PastedContract.sol").trim();
    const effectiveSource = state.source || "";
    const errs = errorsForUpload(effectiveName, effectiveSource);
    if (errs.length > 0) {
      setState(prev => ({ ...prev, uploadValid: false }));
      return;
    }
    setState(prev => ({
      ...prev,
      fileName: effectiveName,
      source: effectiveSource,
      uploadValid: true,
      protocol: "",
      roleMap: {},
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
            A local, pre-launch check for DeFi developers. Map the contract&apos;s roles, then review four simulated attack paths against a safe sample scenario.
          </p>
          <p className="micro tracked" style={{ marginTop: 24 }}>
            NO DEPLOYMENT <span aria-hidden="true">/</span> NO RPC <span aria-hidden="true">/</span> NO AUDIT CLAIM
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
          <div className="upload-divider">OR PASTE SOURCE</div>
          <div className="field">
            <label className="field-label" htmlFor="sourceName">FILE NAME</label>
            <input
              className="text-input"
              id="sourceName"
              name="sourceName"
              value={state.fileName || (hasInteracted ? "" : "PastedContract.sol")}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={120}
              spellCheck={false}
              aria-describedby="uploadErrors"
            />
          </div>
          <div className="field" style={{ marginTop: 11 }}>
            <label className="field-label" htmlFor="sourceCode">SOLIDITY SOURCE</label>
            <textarea
              className="text-area paste-code"
              id="sourceCode"
              name="sourceCode"
              placeholder="// Paste contract source here"
              spellCheck={false}
              aria-describedby="uploadErrors"
              value={code}
              onChange={(e) => handleSourceChange(e.target.value)}
            />
          </div>
          <div className="file-meta">
            <span id="fileMetaName">
              <strong>{state.fileName || "No source selected"}</strong>
            </span>
            <span id="fileMetaSize">{bytes ? `${bytes.toLocaleString()} B` : "0 B"}</span>
          </div>
          <pre
            id="codePreview"
            className={`code-preview${code ? " is-visible" : ""}`}
            aria-label="Monospace Solidity preview"
          >
            {lines || "Preview appears when source is entered."}
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
              .SOL <span aria-hidden="true">/</span> NON-EMPTY <span aria-hidden="true">/</span> &lt;100 KB
            </span>
            <button
              className="button"
              id="continueUpload"
              type="submit"
              disabled={!state.uploadValid}
            >
              CONTINUE <span className="button-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
