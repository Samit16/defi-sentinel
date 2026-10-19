import TechText from "./TechText";
import HeroSplineScene from "./HeroSplineScene";

const steps = [
  { number: "01", title: "Upload Contract", detail: "Upload your Solidity files (.sol) to get started.", icon: "↥" },
  { number: "02", title: "Run Simulations", detail: "Our engine runs controlled attacks on your contract.", icon: "⚙" },
  { number: "03", title: "Analyze Results", detail: "Identify potential vulnerabilities and risky patterns.", icon: "⌕" },
  { number: "04", title: "Review Report", detail: "Get a detailed report with findings and recommendations.", icon: "▤" },
];

const features = [
  { icon: "▤", title: "Smart Contract Analysis", detail: "Upload and analyze Solidity contracts with ease." },
  { icon: "ϟ", title: "Controlled Attack Simulation", detail: "Run predefined attack scenarios in a safe environment." },
  { icon: "⬡", title: "Vulnerability Detection", detail: "Identify potential security issues and risky patterns." },
  { icon: "▤", title: "Clear and Detailed Reports", detail: "Get structured insights to help secure your contracts." },
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
              <span>Upload your Solidity (.sol) files to start security analysis</span>
              <a className="landing-button" href="#/upload"><span aria-hidden="true">↥</span> Choose Files</a>
              <small>or drag and drop files here</small>
            </div>
            <div className="landing-upload-meta"><span>Supported file type: .sol&nbsp;&nbsp; | &nbsp;&nbsp;Multiple files allowed</span><a href="#/upload">View sample&nbsp; →</a></div>
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
            <div><span className="landing-step-number">{step.number}</span><h3>{step.title}</h3><p>{step.detail}</p></div>
            {index < steps.length - 1 && <span className="landing-step-arrow" aria-hidden="true">→</span>}
          </article>)}
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="landing-dashboard-preview" aria-label="Example scan dashboard preview">
          <div className="preview-top"><span><i>◇</i> DeFi Sentinel</span><span>•••</span></div>
          <div className="preview-body">
            <aside><b>▤ &nbsp; New Scan</b><span>▧ &nbsp; Past Scans</span><span>⚙ &nbsp; Settings</span></aside>
            <div className="preview-scan"><strong>Scanning Contract...</strong><div className="preview-progress"><i /></div><div className="preview-progress-meta"><span>65%</span></div>
              {["Parsing source files", "Deploying test environment", "Running controlled attacks", "Analyzing results", "Generating report"].map((item, index) => <p key={item}><i className={index < 2 ? "complete" : index === 2 ? "current" : "pending"}>{index < 2 ? "✓" : index === 2 ? "›" : "·"}</i>{item}<span>{index < 2 ? "Completed" : index === 2 ? "› In progress" : "Pending"}</span></p>)}
            </div>
          </div>
        </div>
        <div className="landing-feature-copy" id="about">
          <p className="landing-eyebrow">FEATURES</p><h2>A focused approach<br />to contract security</h2>
          <div className="landing-feature-list">{features.map(feature => <article key={feature.title}><span className="landing-feature-icon" aria-hidden="true">{feature.icon}</span><div><h3>{feature.title}</h3><p>{feature.detail}</p></div></article>)}</div>
        </div>
      </section>

      <footer className="landing-cta">
        <div className="landing-cta-content"><p className="landing-eyebrow">SECURE SMART CONTRACTS</p><h2>Start analyzing your contract today.</h2><p>Upload your Solidity files and get a comprehensive security analysis<br className="desktop-break" /> with controlled attack simulations.</p><a className="landing-button" href="#/upload">Scan Contract <span>→</span></a></div>
      </footer>
    </main>
  );
}

