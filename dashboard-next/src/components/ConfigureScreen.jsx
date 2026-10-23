import { useEffect } from "react";
import ScreenHeader from "./ScreenHeader";

export const PROTOCOLS = [
  ["VAULT", "Deposits, withdrawals, and shares"],
  ["LENDING", "Collateral, borrowing, and pricing"],
  ["GOVERNANCE", "Proposals, voting, and execution"]
];

export const ROLE_MAP = {
  VAULT: ["deposit", "withdraw", "balanceOf"],
  LENDING: ["depositCollateral", "borrow", "getPrice"],
  GOVERNANCE: ["propose", "vote", "execute"]
};

export const rolesForProtocol = protocol => ROLE_MAP[protocol] || [];

export default function ConfigureScreen({ state, setState }) {
  const hasSource = Boolean(state.source && state.source.trim() && (state.fileName || "").trim());

  const cleanSource = (state.source || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");

  const funcs = [
    ...new Set(
      (cleanSource.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g) || []).map(
        x => x.match(/\bfunction\s+([A-Za-z_$][\w$]*)/)[1]
      )
    )
  ];

  const autoMapRoles = (protocolId, detectedFuncs) => {
    const expected = rolesForProtocol(protocolId);
    const mapping = {};
    for (const role of expected) {
      let match = detectedFuncs.find(f => f.toLowerCase() === role.toLowerCase());
      if (!match) {
        if (role === "vote") {
          match = detectedFuncs.find(f => f.toLowerCase().includes("vote"));
        } else if (role === "getPrice") {
          match = detectedFuncs.find(f => f.toLowerCase().includes("price"));
        } else if (role === "depositCollateral") {
          match = detectedFuncs.find(f => f.toLowerCase().includes("collateral") || f.toLowerCase().includes("deposit"));
        } else if (role === "borrow") {
          match = detectedFuncs.find(f => f.toLowerCase().includes("borrow"));
        } else if (role === "propose") {
          match = detectedFuncs.find(f => f.toLowerCase().includes("propose"));
        } else if (role === "execute") {
          match = detectedFuncs.find(f => f.toLowerCase().includes("execute"));
        } else if (role === "deposit") {
          match = detectedFuncs.find(f => f.toLowerCase().includes("deposit"));
        } else if (role === "withdraw") {
          match = detectedFuncs.find(f => f.toLowerCase().includes("withdraw"));
        } else if (role === "balanceOf") {
          match = detectedFuncs.find(f => f.toLowerCase().includes("balance"));
        }
      }
      if (match) {
        mapping[role] = match;
      }
    }
    return mapping;
  };

  const protocol = state.protocol;
  const roles = rolesForProtocol(protocol);
  const missing = !hasSource
    ? ["valid contract source"]
    : !protocol
    ? ["protocol type"]
    : roles.filter(role => !state.roleMap?.[role]).map(role => `${role} function`);

  const handleSelectProtocol = (id) => {
    const autoMapped = autoMapRoles(id, funcs);
    setState(prev => ({
      ...prev,
      protocol: id,
      roleMap: autoMapped,
    }));
  };

  useEffect(() => {
    if (protocol && funcs.length && (!state.roleMap || Object.keys(state.roleMap).length === 0)) {
      const autoMapped = autoMapRoles(protocol, funcs);
      if (Object.keys(autoMapped).length > 0) {
        setState(prev => ({
          ...prev,
          roleMap: autoMapped,
        }));
      }
    }
  }, [protocol, state.source]);

  const handleRoleSelect = (role, value) => {
    setState(prev => ({
      ...prev,
      roleMap: {
        ...prev.roleMap,
        [role]: value,
      },
    }));
  };

  const handleConstructorArgsChange = (val) => {
    setState(prev => ({
      ...prev,
      constructorArgs: val,
    }));
  };

  const handleToggleHold = (key) => {
    setState(prev => ({
      ...prev,
      holds: {
        ...prev.holds,
        [key]: !prev.holds?.[key],
      },
    }));
  };

  const handleRunSimulation = () => {
    if (!hasSource) {
      window.location.hash = "/upload";
      return;
    }
    if (!protocol) return;
    if (roles.some(role => !state.roleMap?.[role])) return;
    window.location.hash = "/running";
  };

  if (!hasSource) {
    return (
      <section className="screen" aria-labelledby="screen-title">
        <ScreenHeader num="02" label="CONFIGURE ROLES" right="NO SOURCE LOADED" />
        <div className="empty-state">
          <strong>NO CONTRACT SOURCE LOADED</strong>
          Analysis cannot begin without a valid Solidity file. Upload or paste a contract first.
        </div>
        <a className="button" href="#/upload" style={{ marginTop: 20 }}>
          ← GO TO UPLOAD SCREEN
        </a>
      </section>
    );
  }

  return (
    <section className="screen" aria-labelledby="screen-title">
      <ScreenHeader num="02" label="CONFIGURE ROLES" right="FUNCTIONS PARSED LOCALLY" />
      <div className="configure-layout">
        <div>
          <h1 id="screen-title" className="display display-small" style={{ marginBottom: 24 }}>
            Map contract roles.
          </h1>
          <div className="section-rule">01 <span>PROTOCOL TYPE</span></div>
          <div className="protocol-grid" role="group" aria-label="Choose protocol type">
            {PROTOCOLS.map(([id, desc]) => (
              <button
                key={id}
                className="protocol-option"
                type="button"
                data-protocol={id}
                aria-pressed={protocol === id}
                onClick={() => handleSelectProtocol(id)}
              >
                <span className="protocol-name">{id}</span>
                <span className="protocol-description">{desc}</span>
              </button>
            ))}
          </div>
          <div className="section-rule">02 <span>FUNCTION ROLE MAPPING</span></div>
          <p className="micro" style={{ margin: "8px 0 0" }}>
            SELECT THE FUNCTION THAT PLAYS EACH STANDARD ROLE.
          </p>
          <div className="mapping-list">
            {roles.length ? (
              roles.map(role => (
                <label key={role} className="mapping-row">
                  <span className="mapping-label">{role}</span>
                  <select
                    className="select-input role-select"
                    data-role={role}
                    aria-label={`Map function for ${role}`}
                    disabled={!protocol || !funcs.length}
                    value={state.roleMap?.[role] || ""}
                    onChange={(e) => handleRoleSelect(role, e.target.value)}
                  >
                    <option value="">{funcs.length ? "Select function" : "No functions detected"}</option>
                    {funcs.map(fn => (
                      <option key={fn} value={fn}>
                        {fn}()
                      </option>
                    ))}
                  </select>
                </label>
              ))
            ) : (
              <p className="micro">Choose a protocol type to load its expected roles.</p>
            )}
          </div>
          {protocol && !funcs.length ? (
            <div className="notice" role="status">
              <span className="notice-mark">!</span>
              <span>
                No function declarations were found in this source. Map manually or return to upload.
              </span>
            </div>
          ) : null}
        </div>
        <aside className="configure-side bracket-panel">
          <div className="section-rule">03 <span>DEPLOYMENT CONTEXT</span></div>
          <div className="field">
            <label className="field-label" htmlFor="constructorArgs">
              CONSTRUCTOR ARGUMENTS <span className="muted">/ OPTIONAL</span>
            </label>
            <textarea
              className="text-area"
              id="constructorArgs"
              placeholder="e.g. _asset = 0x…"
              spellCheck={false}
              value={state.constructorArgs || ""}
              onChange={(e) => handleConstructorArgsChange(e.target.value)}
            />
          </div>
          <div className="toggle-row">
            <span className="field-label">CONTRACT HOLDS</span>
            <div className="toggle-control">
              <button
                type="button"
                className="toggle-button"
                data-holds="ETH"
                aria-pressed={state.holds?.ETH !== false}
                onClick={() => handleToggleHold("ETH")}
              >
                ETH
              </button>
              <button
                type="button"
                className="toggle-button"
                data-holds="TOKEN"
                aria-pressed={state.holds?.TOKEN === true}
                onClick={() => handleToggleHold("TOKEN")}
              >
                TOKEN
              </button>
            </div>
          </div>
          <div className="notice">
            <span className="notice-mark">i</span>
            <span>
              Target: <strong>{state.fileName}</strong>. Foundry will deploy and simulate attacks on the local EVM.
            </span>
          </div>
          <div className="validation-message" id="configureMessage" role="status">
            {missing.length ? (
              <>
                <span className="missing">RUN DISABLED</span> <span aria-hidden="true">/</span> MAP {missing.join(", ")}.
              </>
            ) : (
              "ALL REQUIRED ROLES MAPPED. READY FOR FOUNDRY EXECUTION."
            )}
          </div>
          <button
            className="button"
            id="runSimulation"
            type="button"
            disabled={missing.length > 0}
            onClick={handleRunSimulation}
          >
            RUN SIMULATION <span className="button-arrow" aria-hidden="true">→</span>
          </button>
        </aside>
      </div>
    </section>
  );
}
