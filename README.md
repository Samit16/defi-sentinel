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
- **Reporting & UI:** The Flask dashboard reads historical JSON reports without invoking the compiler or EVM directly.

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
│   └── run.py                    # CLI command entrypoint
├── dashboard/                    # Block 6: Single-page web dashboard
│   ├── serve.py                  # Flask server (routes: /, /api/reports, /api/reports/<id>)
│   ├── templates/index.html      # Responsive HTML5 single-page application
│   └── static/
│       ├── style.css             # Glassmorphism dark mode UI styling
│       └── app.js                # Report fetcher and security matrix renderer
├── reports/                      # Output directory for persisted simulation reports
│   ├── .gitkeep
│   └── sample_report.json        # Fallback dataset for cold-start demo mode
├── docs/
│   ├── ARCHITECTURE.md           # 6-block architecture diagram & pipeline specification
│   └── RESULT_FORMAT.md          # Frozen JSON schema & SENTINEL_RESULT format
└── tests/
    ├── conftest.py               # Test harness configuration
    └── test_parser.py            # Pytest test suite for output parsing & math validation
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

Start the Flask visualization server:
```bash
python dashboard/serve.py
```
Open your browser to: **[http://localhost:5000](http://localhost:5000)**

### Dashboard Features
- **Summary Cards:** Total simulations, confirmed vulnerabilities (rose), and attacks blocked (emerald).
- **Security Matrix Table:** Side-by-side comparison for each module showing exploit profit in ETH and explanatory notes.
- **Plain-Language Verdict:** Explicit security summary per module (e.g., `VULNERABLE: attacker gained 10.0 ETH` vs `PROTECTED: attack blocked`).
- **Report History Selector:** Dropdown menu allowing instant switching between historical simulation runs.
- **Graceful Fallback:** Automatically switches to `sample_report.json` with a prominent warning badge if no dynamic reports exist.

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
   - Point out the institutional header (Ramdeobaba University, Dept. of AI & Cyber Security, Guide: Dr. Poonam Agarkar).
   - Review the 8-run KPI cards and the head-to-head security matrix table.
   - Select past runs from the Report Run dropdown to show historical persistence.

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
   *When active, the dashboard will display the Network Fork badge and the specific forked block number.*

---

## 10. Limitations & Future Scope

- **Toy Implementations:** The smart contracts are purpose-built educational targets designed to isolate specific attack mechanisms without production dependencies (e.g. full Uniswap v3 math or multi-token liquidity router logic).
- **Single-Transaction Flash Loans:** Flash loan exploits operate atomically within a single block; multi-block MEV sandwiching and cross-chain bridge relay exploits are outside current scope.
- **Future Enhancements:** Extending the module registry to cover read-only reentrancy (Curve/Lido style) and precision loss bugs (ERC4626 inflation attacks).

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
