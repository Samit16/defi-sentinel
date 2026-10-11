// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";

/// @title SentinelBase
/// @notice Shared base contract for all DeFiSentinel attack simulation tests.
/// @dev Reads execution parameters from environment, provides common test accounts,
///      and formats standard SENTINEL_RESULT log lines for python parser ingestion.
abstract contract SentinelBase is Test {
    address payable public attacker = payable(makeAddr("attacker"));
    address public deployer = makeAddr("deployer");
    address public honestUser = makeAddr("honestUser");

    /// @notice Reads VARIANT env variable ("vulnerable" or "protected", default "vulnerable")
    function getVariant() public view returns (string memory) {
        string memory v = vm.envOr("VARIANT", string("vulnerable"));
        if (keccak256(bytes(v)) == keccak256(bytes("protected"))) {
            return "protected";
        }
        return "vulnerable";
    }

    /// @notice Emits the standardized result line for the Python orchestrator
    /// @dev Line format: SENTINEL_RESULT|<module>|<variant>|<SUCCEEDED|FAILED>|<profit_wei>|<note>
    function emitSentinelResult(
        string memory moduleName,
        string memory variant,
        bool succeeded,
        uint256 profitWei,
        string memory note
    ) internal pure {
        string memory status = succeeded ? "SUCCEEDED" : "FAILED";
        console.log(
            string.concat(
                "SENTINEL_RESULT|",
                moduleName,
                "|",
                variant,
                "|",
                status,
                "|",
                vm.toString(profitWei),
                "|",
                note
            )
        );
    }
}
