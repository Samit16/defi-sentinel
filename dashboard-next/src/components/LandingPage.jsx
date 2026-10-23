import TechText from "./TechText";
import HeroSplineScene from "./HeroSplineScene";

const steps = [
  {
    number: "01",
    title: "Upload Contract",
    detail: "Upload your Solidity files (.sol) to get started.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Run Simulations",
    detail: "Our engine runs controlled attacks on your contract.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Analyze Results",
    detail: "Identify potential vulnerabilities and risky patterns.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    number: "04",
    title: "Review Report",
    detail: "Get a detailed report with findings and recommendations.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
];

const features = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    title: "Smart Contract Analysis",
    detail: "Upload and analyze Solidity contracts with ease.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: "Controlled Attack Simulation",
    detail: "Run predefined attack scenarios in a safe environment.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Vulnerability Detection",
    detail: "Identify potential security issues and risky patterns.",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    title: "Clear and Detailed Reports",
    detail: "Get structured insights to help secure your contracts.",
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="#home" aria-label="DeFi Sentinel home">
          <span className="landing-brand-mark">◇</span>
          <span className="landing-brand-techtext">
            <TechText
              text="DeFi Sentinel"
              fontFamily="IBMPlexSans"
              fontWeight={600}
              fontSize={22}
              color="currentColor"
              accentColor="var(--mint)"
              align="left"
              reveal="letter"
              specks={5}
              selection={false}
              labels={false}
              draggable={false}
              sweep
              clickKick={false}
              intro="none"
            />
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a className="is-active" href="#home">Home</a>
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="#about">About</a>
        </nav>
        <a className="landing-button landing-button--outline" href="#/upload">Scan Contract <span>→</span></a>
      </header>

      <section className="landing-hero" id="home">
        <div className="landing-hero-layout">
          <div className="landing-hero-content">
          <p className="landing-eyebrow">SMART CONTRACT SECURITY ANALYSIS</p>
          <h1>Find vulnerabilities<br />before <span>attackers</span> do.</h1>
          <p className="landing-lede">Upload your smart contract, run controlled attack simulations, and identify potential vulnerabilities with DeFi Sentinel.</p>
          <div className="landing-upload-card">
            <div className="landing-dropzone">
              <span className="landing-file-icon" aria-hidden="true">▤</span>
              <strong>Upload Smart Contract</strong>
              <a className="landing-button" href="#/upload"><span aria-hidden="true">↥</span> Choose Files</a>
              <small>or drag and drop files here</small>
            </div>
            <div className="landing-upload-meta"><span>Supported file type: .sol</span></div>
          </div>
          </div>
          <HeroSplineScene />
        </div>
      </section>

      <section className="landing-process" id="how-it-works">
        <p className="landing-eyebrow">HOW IT WORKS</p>
        <h2>From code to security insights</h2>
        <p className="landing-section-lede">A simple process to analyze your smart contracts for potential vulnerabilities.</p>
        <div className="landing-steps">
          {steps.map((step, index) => <article className="landing-step" key={step.number}>
            <span className="landing-step-icon" aria-hidden="true">{step.icon}</span>
            <div><span className="landing-step-number">{step.number}</span><h3>{step.title}</h3></div>
            {index < steps.length - 1 && <span className="landing-step-arrow" aria-hidden="true">→</span>}
          </article>)}
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="landing-dashboard-preview" aria-label="Example scan dashboard preview">
          <div className="preview-top"><span><i>◇</i> DeFi Sentinel</span><span>•••</span></div>
          <div className="preview-body">
            <aside><b>▤ &nbsp; New Scan</b><span>▧ &nbsp; Past Scans</span><span>⚙ &nbsp; Settings</span></aside>
            <div className="preview-scan">
              <strong>Scanning Contract...</strong>
              <div className="preview-progress"><i /></div>
              <div className="preview-progress-meta"><span>65%</span></div>
              {["Parsing source files", "Deploying test environment", "Running controlled attacks", "Analyzing results", "Generating report"].map((item, index) => (
                <p key={item}>
                  <i className={index < 2 ? "complete" : index === 2 ? "current" : "pending"}>{index < 2 ? "✓" : index === 2 ? "›" : "·"}</i>
                  {item}
                  <span>{index < 2 ? "Completed" : index === 2 ? "› In progress" : "Pending"}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
        <div className="landing-feature-copy" id="about">
          <p className="landing-eyebrow">FEATURES</p><h2>A focused approach<br />to contract security</h2>
          <div className="landing-feature-list">{features.map(feature => <article key={feature.title}><span className="landing-feature-icon" aria-hidden="true">{feature.icon}</span><div><h3>{feature.title}</h3></div></article>)}</div>
        </div>
      </section>

      <footer className="landing-cta">
        <div className="landing-cta-content">
          <p className="landing-eyebrow">SECURE SMART CONTRACTS</p>
          <h2 style={{ marginBottom: "32px" }}>Start analyzing your contract today.</h2>
          <a className="landing-button" href="#/upload">Scan Contract <span>→</span></a>
        </div>
      </footer>
    </main>
  );
}
