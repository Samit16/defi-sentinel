import argparse
import re
import sys
from pathlib import Path

from orchestrator.config import (
    FORK_BLOCK as CONFIG_FORK_BLOCK,
    MODE as CONFIG_MODE,
    PROJECT_ROOT,
    RPC_URL as CONFIG_RPC_URL,
)
from orchestrator.parser import parse_forge_output
from orchestrator.report_writer import write_report
from orchestrator.runner import run_forge_test


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run a custom DeFiSentinel Foundry attack harness",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    parser.add_argument(
        "--test-path",
        required=True,
        help="Path to a .t.sol file inside contracts/attacks",
    )
    parser.add_argument(
        "--module",
        required=True,
        help="Result module ID: lowercase letters, digits and underscores",
    )
    parser.add_argument(
        "--variant",
        choices=["vulnerable", "protected", "both"],
        default="both",
    )
    parser.add_argument(
        "--mode",
        choices=["local", "fork"],
        default=CONFIG_MODE,
    )
    parser.add_argument(
        "--rpc-url",
        default=CONFIG_RPC_URL,
        help="RPC endpoint required for fork mode",
    )
    parser.add_argument(
        "--fork-block",
        default=CONFIG_FORK_BLOCK,
        help="Optional fixed block number for fork mode",
    )

    return parser


def validate_test_path(value: str) -> str:
    """Validate and return a project-relative Foundry test path."""

    project_root = PROJECT_ROOT.resolve()
    allowed_root = (project_root / "contracts" / "attacks").resolve()
    candidate = (project_root / value).resolve()

    try:
        candidate.relative_to(allowed_root)
    except ValueError as exc:
        raise ValueError(
            "Custom test must be located inside contracts/attacks"
        ) from exc

    if not candidate.name.endswith(".t.sol"):
        raise ValueError("Custom test file must end with .t.sol")

    if not candidate.is_file():
        raise ValueError(f"Custom test file not found: {value}")

    return candidate.relative_to(project_root).as_posix()


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    if not re.fullmatch(r"[a-z][a-z0-9_]{0,31}", args.module):
        parser.error(
            "--module must start with a lowercase letter and contain "
            "only lowercase letters, digits or underscores (max 32 chars)"
        )

    try:
        test_path = validate_test_path(args.test_path)

        if args.mode == "fork" and not args.rpc_url.strip():
            raise ValueError(
                "Fork mode requires --rpc-url or RPC_URL in .env"
            )

        if args.fork_block:
            block_number = int(args.fork_block)
            if block_number < 0:
                raise ValueError("--fork-block must be non-negative")

    except ValueError as exc:
        parser.error(str(exc))

    variants = (
        ["vulnerable", "protected"]
        if args.variant == "both"
        else [args.variant]
    )

    results = []

    print("=" * 60)
    print("  DeFiSentinel Custom Harness Runner")
    print("=" * 60)
    print(f"Test:     {test_path}")
    print(f"Module:   {args.module}")
    print(f"Mode:     {args.mode}")
    print(f"Variants: {', '.join(variants)}")

    if args.mode == "fork":
        print(f"Fork block: {args.fork_block or 'latest'}")

    for variant in variants:
        print(f"\n[*] Running {args.module} [{variant}] ...")

        try:
            output, duration_s = run_forge_test(
                test_path=test_path,
                variant=variant,
                mode=args.mode,
                rpc_url=args.rpc_url,
                fork_block=args.fork_block,
            )

            result = parse_forge_output(
                output,
                duration_s=duration_s,
            )

            # Do not silently accept stale or unrelated result markers.
            if result["module"] != args.module:
                raise ValueError(
                    f"Expected module '{args.module}', "
                    f"received '{result['module']}'"
                )

            if result["variant"] != variant:
                raise ValueError(
                    f"Expected variant '{variant}', "
                    f"received '{result['variant']}'"
                )

            results.append(result)

            print(
                f"    [{result['status']}] "
                f"Profit: {result['profit_eth']} ETH "
                f"({duration_s:.2f}s) - {result['note']}"
            )

        except Exception as exc:
            print(
                f"[!] Harness failed for {variant}: {exc}",
                file=sys.stderr,
            )
            return 1

    try:
        report_path = write_report(
            results=results,
            mode=args.mode,
            fork_block=args.fork_block or None,
        )
    except Exception as exc:
        print(
            f"[!] Failed to write report: {exc}",
            file=sys.stderr,
        )
        return 1

    print("\n" + "-" * 60)
    print(f"Custom simulation complete: {len(results)} result(s)")
    print(f"Report: {report_path}")
    print("-" * 60)

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
