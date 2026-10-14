# DeFiSentinel: End-to-End DeFi Security Simulation Framework

> **Academic Project Context:**
> **Institution:** Ramdeobaba University, Department of AI & Cyber Security
> **Curriculum:** Semester 5 — IDEA Lab Project
> **Project Guide:** Dr. Poonam Agarkar
> **Team Members:**
> - Ketaki Muthal (Roll 6)
> - Krishanu Chatterjee (Roll 14)
> - Mehul Tank (Roll 19)
> - Malhar Kalmegh (Roll 25)
> - Samit Bhisikar (Roll 33)

---

## 1. Project Overview

**DeFiSentinel** is an automated, end-to-end security simulation engine that benchmarks decentralised finance (DeFi) smart contract attack vectors against defensibly engineered implementations. 

Running directly on a local in-memory Ethereum Virtual Machine (EVM) via Foundry with zero mocked results, DeFiSentinel demonstrates four critical vulnerability archetypes:
1. **Flash Loan Multi-Step Arbitrage & Liquidity Draining**
2. **Oracle Manipulation via AMM Spot Price Distortion**
3. **Reentrancy Exploitation via State Inversion**
4. **Governance Takeover via Flash-Loaned Voting Weight**

Every scenario pairs a **VULNERABLE** contract with a **PROTECTED** mitigation variant. The test harness executes real atomic transactions, calculates extracted profit in wei/ETH, and renders interactive side-by-side verification matrices in a single-page web dashboard.

---

## 2. Six-Block Architectural Pipeline

DeFiSentinel adheres to strict separation of concerns across a unidirectional 6-block pipeline:

```
Block 0: Config (.env, config.py)
   ↓
Block 1: Targets (Toy Solidity ^0.8.20 Vulnerable & Protected Contracts)
   ↓
Block 2: Foundry EVM (Local in-memory sandbox / Optional network fork)
   ↓
Block 3: Attacks (Solidity .t.sol Forge Tests & SENTINEL_RESULT logging)
   ↓
Block 4: Orchestrator (Python runner, regex parser, wei→ETH conversion)
   ↓
Block 5: Report JSON (Timestamped immutable records in reports/)
   ↓
Block 6: Web Dashboard (Flask REST API + Vanilla JS/CSS Visualization)
```

- **Execution Engine:** Foundry compiles and runs real EVM bytecode.
- **Orchestration Layer:** Python launches tests via subprocess, parses standard output logs, and writes reports.
- **Reporting & UI:** The Flask dashboard reads historical JSON reports. It starts new simulations only through the orchestrator (`/api/scans`), never by calling the compiler or EVM itself.

Detailed architecture specifications and flow diagrams are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 3. Supported Attack Classes & Target Implementations

| Attack Class | Module ID | Target Contract (Vulnerable) | Target Contract (Protected) | Defense Mechanism |
|---|---|---|---|---|
| **Reentrancy** | `reentrancy` | `VaultVulnerable.sol` | `VaultProtected.sol` | Checks-Effects-Interactions (CEI) pattern + `nonReentrant` mutex lock. |
| **Oracle Manipulation** | `oracle` | `LendingVulnerable.sol` | `LendingProtected.sol` | Replaces spot price with Time-Weighted Average Price (TWAP) and 5% circuit breaker. |
| **Flash Loan Attack** | `flash_loan` | `FlashLender.sol` + `SimpleAMM.sol` + `LendingVulnerable.sol` | `LendingProtected.sol` | Multi-block TWAP oracle and deviation sanity checks prevent intra-block pump-and-dump. |
| **Governance Takeover** | `governance` | `GovernanceVulnerable.sol` | `GovernanceProtected.sol` | Historical snapshot voting power (`getPastVotes`) from `block.number - 1` + voting delay. |

---

## 4. Repository Structure

```
DeFiSentinel/
├── README.md                     # Project documentation & team credentials
├── .env.example                  # Environment configuration template
├── .gitignore                    # Build artifacts and dynamic reports filter
├── foundry.toml                  # Foundry project configuration
├── requirements.txt              # Python runtime dependencies
├── contracts/
│   ├── targets/                  # Block 1: Target contracts & primitives
│   │   ├── mocks/
│   │   │   ├── MockERC20.sol     # Mintable ERC20 test token
│   │   │   └── MockGovToken.sol  # Checkpointed governance token with snapshot lookups
│   │   ├── SimpleAMM.sol         # Constant-product (x*y=k) AMM with spot price & TWAP
│   │   ├── FlashLender.sol       # ERC-3156 style toy flash loan lender (0.09% fee)
│   │   ├── VaultVulnerable.sol   # ETH Vault with external call before balance reset
│   │   ├── VaultProtected.sol    # Secure ETH Vault with CEI + reentrancy guard
│   │   ├── LendingVulnerable.sol # Collateral valued directly by AMM spot price
│   │   ├── LendingProtected.sol  # Collateral valued by TWAP with 5% deviation guard
│   │   ├── GovernanceVulnerable.sol # DAO voting power = live token balance
│   │   └── GovernanceProtected.sol  # DAO voting power = prior block snapshot balance
│   └── attacks/                  # Block 3: Attack simulation suites (.t.sol)
│       ├── SentinelBase.t.sol    # Shared base harness with SENTINEL_RESULT logging
│       ├── Reentrancy.t.sol      # Reentrant withdrawal simulation
│       ├── OracleManipulation.t.sol # AMM spot price pump & uncollateralized borrow
│       ├── FlashLoan.t.sol       # Composite flash loan pump-and-dump exploit
│       └── Governance.t.sol      # Flash-loaned voting weight proposal hijacking
├── orchestrator/                 # Block 4 & 5: Simulation engine
│   ├── __init__.py
│   ├── config.py                 # Environment variables and module registry
│   ├── runner.py                 # Subprocess execution of forge tests with timeouts
│   ├── parser.py                 # Strict regex log extraction and wei→ETH conversion
│   ├── report_writer.py          # JSON report generation adhering to frozen schema
│   ├── engine.py                 # Shared "run one module/variant" logic + forge build step
│   ├── scan_manager.py           # Background scan jobs with live progress (used by the web API)
│   ├── custom_run.py             # CLI for running your own .t.sol attack harness
│   └── run.py                    # CLI command entrypoint
├── dashboard/                    # Block 6: Web dashboard
│   ├── serve.py                  # Flask server (reports API + scan API, see section 7)
│   ├── templates/index.html      # App shell
│   └── static/new-ui/            # Single-page UI (hash-routed ES modules, Three.js background)
│       ├── js/app.js             # Router, state, upload/configure/run/report flow
│       ├── js/views.js           # Screen templates
│       ├── js/real-api.js        # Client for /api/health, /api/scans and /api/reports
│       └── js/mock-api.js        # Demo-data fallback when Foundry is not installed
├── reports/                      # Output directory for persisted simulation reports
│   ├── .gitkeep
│   └── sample_report.json        # Fallback dataset for cold-start demo mode
├── docs/
│   ├── ARCHITECTURE.md           # 6-block architecture diagram & pipeline specification
│   └── RESULT_FORMAT.md          # Frozen JSON schema & SENTINEL_RESULT format
└── tests/
    ├── conftest.py               # Test harness configuration
    ├── test_parser.py            # Output parsing & wei→ETH math
    ├── test_report_writer.py     # Report schema and persistence
    ├── test_api.py               # Reports REST API
    ├── test_scans.py             # Scan manager + /api/scans (Foundry faked)
    ├── test_custom_run.py        # Custom harness CLI validation
    └── test_engine_integration.py# Real Foundry run (auto-skipped if forge is missing)
```

---

## 5. Prerequisites & Quickstart Setup

### Prerequisites
- **Foundry / Forge:** Verified with version 1.8.5+ (`forge --version`).
- **Python:** Python 3.10+ (tested on Python 3.13.5).
- **Environment:** Windows, macOS, or Linux.

### Activation
On Windows, activate the existing virtual environment:
```powershell
venv\Scripts\activate
```

*(On macOS/Linux: `source venv/bin/activate`)*

To install or verify Python dependencies:
```bash
pip install -r requirements.txt
```

Fetch the Foundry standard library (it is a git submodule and is not in a plain zip download):
```bash
git submodule update --init --recursive   # or: forge install foundry-rs/forge-std
```

Compile contracts and run unit tests:
```bash
forge build
pytest tests/
```

---

## 6. Running Simulations

### Run All Modules Across Both Variants (Default)
Executes all 4 attack vectors on both Vulnerable and Protected targets:
```bash
python -m orchestrator.run --modules all --variant both
```
Expected output: 8 tests executed, **4 Succeeded (Vulnerabilities Confirmed)** and **4 Failed (Attacks Blocked)**.

### Run a Specific Module
Simulate only the Flash Loan attack:
```bash
python -m orchestrator.run --modules flash_loan --variant both
```

Simulate only Reentrancy on the vulnerable contract:
```bash
python -m orchestrator.run --modules reentrancy --variant vulnerable
```

### CLI Command Options
- `--modules`: Comma-separated list (`reentrancy,oracle,flash_loan,governance`) or `all`.
- `--variant`: `vulnerable`, `protected`, or `both` (default: `both`).
- `--mode`: `local` (default, in-memory EVM) or `fork` (EVM forked from an RPC endpoint).
- `--rpc-url`: Custom RPC endpoint (required if `--mode fork`).
- `--fork-block`: Target block number to fork from.

---

## 7. Launching the Web Dashboard

Start the Flask server (Foundry must be on `PATH` for live runs):
```bash
python dashboard/serve.py
```
Open your browser to: **[http://localhost:5000](http://localhost:5000)**

### Flow
1. **Upload** a `.sol` file (or paste source), 2. **Configure** protocol roles, 3. **Run**, 4. **Report**, plus a **History** view.
- When Foundry is available, **Run** launches the real engine: live per-module progress, then a head-to-head report (vulnerable vs protected) with observed profit in ETH. The top strip reads `LIVE ENGINE`.
- If Foundry is not installed, the UI falls back to clearly labelled **demo data** (`DEMO DATA / NOT A REAL SCAN`).
- **Important:** the live engine currently attacks DeFiSentinel's *built-in reference contracts*. Uploaded source is collected for the workflow but is **not yet analysed or executed**; the report says so explicitly.
- **History** lists real reports from `reports/` (and demo reports stored in the browser).

### REST API
| Method & path | Purpose |
|---|---|
| `GET /api/health` | Liveness, `engine_available` (Foundry found), `fork_configured` |
| `GET /api/reports` | List persisted reports (falls back to `sample_report.json` if none) |
| `GET /api/reports/<id>` | One report by id, filename, or `latest` |
| `POST /api/scans` | Start a scan. JSON body (all optional): `{"modules": "all" \| ["reentrancy", ...], "variant": "both" \| "vulnerable" \| "protected", "mode": "local" \| "fork"}`. Returns `202 {"id": ...}`; `409` if a scan is already running; `503` if Foundry is missing |
| `GET /api/scans/<id>` | Live status: `status` (`queued/building/running/done/error/cancelled`), per-module rows, `overall` %, `report_id` when done |
| `POST /api/scans/<id>/cancel` | Stop before the next forge run (no report is written) |

Only one scan runs at a time (Foundry shares its build cache). The RPC URL and fork block are read from the server's `.env` only, never from the request. The server binds to `127.0.0.1` and has no authentication; do not expose it publicly.

---

## 8. Live Demonstration Script (Step-by-Step)

For presentations, evaluations, and viva demonstrations:

1. **Verify Environment:**
   ```bash
   forge --version
   pytest tests/
   ```
2. **Execute Full Attack Simulation Suite:**
   ```bash
   python -m orchestrator.run --modules all --variant both
   ```
   *Observe the CLI output as each attack executes:*
   - `reentrancy [vulnerable]` extracts 10.0 ETH; `[protected]` is blocked by mutex lock.
   - `oracle [vulnerable]` extracts 61.90 ETH; `[protected]` is blocked by TWAP deviation check.
   - `flash_loan [vulnerable]` extracts 154.01 ETH; `[protected]` is blocked by lending circuit breaker.
   - `governance [vulnerable]` drains 10.0 ETH; `[protected]` is blocked by zero voting weight at historical snapshot.
3. **Launch the Dashboard:**
   ```bash
   python dashboard/serve.py
   ```
4. **Demonstrate Web Interface:**
   - Navigate to `http://localhost:5000`.
   - Walk Upload → Configure → Run, and show the live progress and the 8 real results in the report.
   - Open the History tab to show persisted runs.

---

## 9. Fork Mode (Optional)

DeFiSentinel runs completely offline by default using `MODE=local`. If you wish to simulate attacks on top of live blockchain state (e.g., Ethereum Mainnet or Sepolia):

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Configure your RPC URL and fork parameters:
   ```env
   MODE=fork
   RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
   FORK_BLOCK=18500000
   ```
3. Run orchestrator in fork mode:
   ```bash
   python -m orchestrator.run --mode fork
   ```
   *Fork mode is also available from the dashboard API (`"mode": "fork"`) when `RPC_URL` is set in `.env`.*

---

## 10. Limitations & Future Scope

- **Toy Implementations:** The smart contracts are purpose-built educational targets designed to isolate specific attack mechanisms without production dependencies (e.g. full Uniswap v3 math or multi-token liquidity router logic).
- **Single-Transaction Flash Loans:** Flash loan exploits operate atomically within a single block; multi-block MEV sandwiching and cross-chain bridge relay exploits are outside current scope.
- **Uploaded Contracts Are Not Scanned Yet:** the dashboard's upload/configure steps do not yet generate harnesses for arbitrary user contracts; the engine runs the built-in reference targets. Custom harnesses can be run from the CLI (`python -m orchestrator.custom_run`).
- **Future Enhancements:** Scanning uploaded contracts via role-mapped adapter harnesses; Extending the module registry to cover read-only reentrancy (Curve/Lido style) and precision loss bugs (ERC4626 inflation attacks).

---

## 11. Project Credits & Acknowledgements

- **Department:** AI & Cyber Security, Ramdeobaba University
- **Course:** Semester 5 IDEA Lab
- **Project Guide:** Dr. Poonam Agarkar
- **Project Team:**
  - Ketaki Muthal (Roll 6)
  - Krishanu Chatterjee (Roll 14)
  - Mehul Tank (Roll 19)
  - Malhar Kalmegh (Roll 25)
  - Samit Bhisikar (Roll 33)
