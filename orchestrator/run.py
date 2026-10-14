"""CLI Entrypoint for the DeFiSentinel security simulation orchestrator.

Parses command-line arguments, drives test execution via Foundry, parses result markers,
and persists execution reports.
"""

import argparse
import sys
from typing import List

from orchestrator.config import (
    MODULE_REGISTRY,
    DEFAULT_MODULES,
    DEFAULT_VARIANTS,
    MODE as CONFIG_MODE,
    RPC_URL as CONFIG_RPC_URL,
    FORK_BLOCK as CONFIG_FORK_BLOCK,
)
from orchestrator.engine import run_single
from orchestrator.report_writer import write_report


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="DeFiSentinel Security Simulation Orchestrator",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--modules",
        type=str,
        default="all",
        help="Comma-separated module names (reentrancy, oracle, flash_loan, governance) or 'all'",
    )
    parser.add_argument(
        "--variant",
        type=str,
        default="both",
        choices=["vulnerable", "protected", "both"],
        help="Target variant to test",
    )
    parser.add_argument(
        "--mode",
        type=str,
        default=CONFIG_MODE,
        choices=["local", "fork"],
        help="Execution mode ('local' in-memory mocks or 'fork' live EVM state)",
    )
    parser.add_argument(
        "--rpc-url",
        type=str,
        default=CONFIG_RPC_URL,
        help="RPC endpoint (required for --mode fork)",
    )
    parser.add_argument(
        "--fork-block",
        type=str,
        default=CONFIG_FORK_BLOCK,
        help="Block number to fork from (optional for --mode fork)",
    )
    return parser


def parse_modules_arg(modules_arg: str) -> List[str]:
    if modules_arg.strip().lower() == "all":
        return list(DEFAULT_MODULES)
    requested = [m.strip().lower() for m in modules_arg.split(",") if m.strip()]
    invalid = [m for m in requested if m not in MODULE_REGISTRY]
    if invalid:
        raise ValueError(
            f"Unknown module(s): {', '.join(invalid)}. Available modules: {', '.join(MODULE_REGISTRY.keys())}"
        )
    return requested


def parse_variants_arg(variant_arg: str) -> List[str]:
    if variant_arg == "both":
        return list(DEFAULT_VARIANTS)
    return [variant_arg]


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    try:
        modules = parse_modules_arg(args.modules)
        variants = parse_variants_arg(args.variant)
    except ValueError as e:
        print(f"[!] Error: {e}", file=sys.stderr)
        return 1

    print("=" * 60)
    print("  DeFiSentinel Security Simulation Engine")
    print("=" * 60)
    print(f"Mode:     {args.mode}")
    print(f"Modules:  {', '.join(modules)}")
    print(f"Variants: {', '.join(variants)}")
    if args.mode == "fork":
        print(f"RPC URL:  {args.rpc_url[:30]}...")
        if args.fork_block:
            print(f"Block:    {args.fork_block}")
    print("=" * 60)

    results = []
    for module in modules:
        for variant in variants:
            print(f"\n[*] Executing {module} [{variant}] ...")
            try:
                result = run_single(
                    module,
                    variant,
                    mode=args.mode,
                    rpc_url=args.rpc_url,
                    fork_block=args.fork_block,
                )
                duration_s = result["duration_s"]
                results.append(result)

                status_tag = f"[{result['status']}]"
                print(
                    f"    {status_tag:<11} Profit: {result['profit_eth']} ETH ({duration_s:.2f}s) - {result['note']}"
                )
            except Exception as e:
                print(f"[!] Failed executing {module} [{variant}]: {e}", file=sys.stderr)
                return 1

    # Persist report
    try:
        report_path = write_report(
            results=results,
            mode=args.mode,
            fork_block=args.fork_block if args.fork_block else None,
        )
    except Exception as e:
        print(f"[!] Failed writing report: {e}", file=sys.stderr)
        return 1

    # Print summary
    succeeded = sum(1 for r in results if r["status"] == "SUCCEEDED")
    failed = sum(1 for r in results if r["status"] == "FAILED")
    print("\n" + "-" * 60)
    print(f"Simulation Complete: Total {len(results)} | Succeeded {succeeded} | Failed {failed}")
    print("-" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
