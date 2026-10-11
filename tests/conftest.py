"""Pytest test setup and sys.path configuration.
"""

import sys
from pathlib import Path

# Add project root directory to sys.path so tests can import orchestrator and dashboard
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
