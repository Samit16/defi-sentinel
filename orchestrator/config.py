"""Configuration loader and module registry for DeFiSentinel.

Loads environment variables from .env and defines supported attack modules.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Base paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = PROJECT_ROOT / "reports"

# Load .env if present
load_dotenv(PROJECT_ROOT / ".env")

# Execution settings
MODE = os.getenv("MODE", "local").lower()
RPC_URL = os.getenv("RPC_URL", "").strip()
FORK_BLOCK = os.getenv("FORK_BLOCK", "").strip()

# Registry of simulation modules mapping module_id to Foundry test file relative to project root
MODULE_REGISTRY = {
    "reentrancy": "contracts/attacks/Reentrancy.t.sol",
    "oracle": "contracts/attacks/OracleManipulation.t.sol",
    "flash_loan": "contracts/attacks/FlashLoan.t.sol",
    "governance": "contracts/attacks/Governance.t.sol",
}

DEFAULT_MODULES = list(MODULE_REGISTRY.keys())
DEFAULT_VARIANTS = ["vulnerable", "protected"]
