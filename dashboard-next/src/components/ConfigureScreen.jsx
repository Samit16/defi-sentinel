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
          <div className="eyebrow">STAGE 02 / ATTACK SURFACE DEFINITION</div>
          <h1 id="screen-title" className="display display-small" style={{ marginBottom: 12 }}>
            Map contract roles.
          </h1>
          <p className="lede" style={{ marginBottom: 26, fontSize: "15px" }}>
            Select your protocol archetype and link each entry point to standard DeFi roles so the simulation engine can test realistic attack sequences.
          </p>

          <div className="section-rule">STEP 01 <span>SELECT PROTOCOL ARCHETYPE</span></div>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="protocol-name">{id}</span>
                  {protocol === id && <span className="pill-badge" style={{ color: "var(--mint)" }}>SELECTED</span>}
                </div>
                <span className="protocol-description">{desc}</span>
              </button>
            ))}
          </div>

          <div className="section-rule" style={{ marginTop: 28 }}>
            STEP 02 <span>FUNCTION ROLE MAPPING</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 14px" }}>
            <p className="micro" style={{ margin: 0 }}>
              ASSIGN DETECTED SOLIDITY FUNCTIONS TO ATTACK ROLES ({funcs.length} DETECTED)
            </p>
            {funcs.length > 0 && protocol && (
              <span className="auto-mapped-hint" style={{ fontSize: "11px", color: "var(--mint)" }}>
                ✓ Smart auto-mapped
              </span>
            )}
          </div>

          <div className="mapping-list">
            {roles.length ? (
              roles.map(role => {
                const isMapped = Boolean(state.roleMap?.[role]);
                return (
                  <div key={role} className="mapping-row bracket-panel" style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="mapping-label">
                        {role} <span style={{ color: "var(--mint)" }}>*</span>
                      </span>
                      <span className={`role-badge ${isMapped ? "is-mapped" : "is-unmapped"}`}>
                        {isMapped ? "✓ MAPPED" : "REQUIRED"}
                      </span>
                    </div>
                    <select
                      className="select-input role-select"
                      data-role={role}
                      aria-label={`Map function for ${role}`}
                      disabled={!protocol || !funcs.length}
                      value={state.roleMap?.[role] || ""}
                      onChange={(e) => handleRoleSelect(role, e.target.value)}
                    >
                      <option value="">{funcs.length ? "-- Choose function --" : "No functions detected"}</option>
                      {funcs.map(fn => (
                        <option key={fn} value={fn}>
                          {fn}()
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })
            ) : (
              <div className="notice" style={{ gridColumn: "1 / -1" }}>
                <span className="notice-mark">→</span>
                <span>Select a protocol archetype above to load its required role mapping inputs.</span>
              </div>
            )}
          </div>
          {protocol && !funcs.length ? (
            <div className="notice" role="status" style={{ marginTop: 14 }}>
              <span className="notice-mark">!</span>
              <span>
                No function declarations were auto-detected. Check contract syntax or return to Upload.
              </span>
            </div>
          ) : null}
        </div>

        <aside className="configure-side bracket-panel">
          <div className="section-rule">STEP 03 <span>DEPLOYMENT CONTEXT</span></div>
          <div className="field">
            <label className="field-label" htmlFor="constructorArgs">
              CONSTRUCTOR ARGUMENTS <span className="muted">/ OPTIONAL</span>
            </label>
            <textarea
              className="text-area"
              id="constructorArgs"
              placeholder="e.g. 0x123..., 18, 1000000000000000000"
              spellCheck={false}
              value={state.constructorArgs || ""}
              onChange={(e) => handleConstructorArgsChange(e.target.value)}
            />
            <small className="field-hint" style={{ fontSize: "10px", color: "var(--muted)" }}>
              Comma-separated parameters for the contract constructor during deployment.
            </small>
          </div>
          <div className="toggle-row">
            <div>
              <span className="field-label" style={{ display: "block" }}>TEST ASSETS HELD</span>
              <small style={{ fontSize: "10px", color: "var(--muted)" }}>Simulated treasury funds</small>
            </div>
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
                ERC20 TOKEN
              </button>
            </div>
          </div>
          <div className="notice">
            <span className="notice-mark">i</span>
            <span>
              Target: <strong>{state.fileName}</strong>. An isolated local Foundry EVM instance will deploy and test 4 attack vectors.
            </span>
          </div>

          <div className="validation-message" id="configureMessage" role="status">
            {missing.length ? (
              <div className="missing-summary">
                <span className="missing">⚠ ACTION REQUIRED</span>
                <p style={{ margin: "4px 0 0", fontSize: "11px" }}>
                  Please assign: <strong>{missing.join(", ")}</strong> before starting execution.
                </p>
              </div>
            ) : (
              <div className="ready-summary" style={{ color: "var(--mint)" }}>
                ✓ ALL ROLES CONFIGURED. Ready for local simulation.
              </div>
            )}
          </div>
          <button
            className="button"
            id="runSimulation"
            type="button"
            disabled={missing.length > 0}
            onClick={handleRunSimulation}
            title={missing.length > 0 ? `Complete missing configuration: ${missing.join(", ")}` : "Start Foundry EVM attack simulations"}
          >
            START ATTACK SIMULATION <span className="button-arrow" aria-hidden="true">→</span>
          </button>
        </aside>
      </div>
    </section>
  );
}
